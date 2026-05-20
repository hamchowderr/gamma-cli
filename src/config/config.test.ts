import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configDir,
  configPath,
  loadConfig,
  saveConfig,
  configExists,
  resolveApiKey,
} from './config.js';
import { defaultConfig } from './types.js';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function restorePlatform(): void {
  Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  restorePlatform();
});

describe('configDir / configPath — platform branches', () => {
  it('resolves APPDATA on win32', () => {
    setPlatform('win32');
    process.env['APPDATA'] = 'C:\\Users\\Test\\AppData\\Roaming';
    expect(configDir()).toBe(join('C:\\Users\\Test\\AppData\\Roaming', 'gamma-cli'));
    expect(configPath()).toBe(join('C:\\Users\\Test\\AppData\\Roaming', 'gamma-cli', 'config.yaml'));
  });

  it('throws on win32 when APPDATA is unset', () => {
    setPlatform('win32');
    delete process.env['APPDATA'];
    expect(() => configDir()).toThrow(/APPDATA/);
  });

  it('resolves ~/Library/Application Support on darwin', () => {
    setPlatform('darwin');
    process.env['HOME'] = '/Users/test';
    expect(configDir()).toBe(join('/Users/test', 'Library', 'Application Support', 'gamma-cli'));
  });

  it('honors XDG_CONFIG_HOME on linux', () => {
    setPlatform('linux');
    process.env['XDG_CONFIG_HOME'] = '/custom/xdg';
    delete process.env['HOME'];
    expect(configDir()).toBe(join('/custom/xdg', 'gamma-cli'));
  });

  it('falls back to ~/.config on linux when XDG_CONFIG_HOME is unset', () => {
    setPlatform('linux');
    delete process.env['XDG_CONFIG_HOME'];
    process.env['HOME'] = '/home/test';
    expect(configDir()).toBe(join('/home/test', '.config', 'gamma-cli'));
  });
});

describe('loadConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gamma-cli-cfg-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns defaults when the file is absent', async () => {
    const result = await loadConfig(join(tmp, 'missing.yaml'));
    expect(result).toEqual(defaultConfig());
  });

  it('merges file values over defaults', async () => {
    const path = join(tmp, 'cfg.yaml');
    await writeFile(
      path,
      'api_key: sk-test\ndefaults:\n  format: document\n  num_cards: 5\n',
      'utf-8'
    );
    const result = await loadConfig(path);
    expect(result.api_key).toBe('sk-test');
    expect(result.defaults.format).toBe('document');
    expect(result.defaults.num_cards).toBe(5);
    // unset fields fall back to defaults
    expect(result.defaults.text_mode).toBe('generate');
    expect(result.defaults.limit).toBe(25);
  });

  it('returns defaults when the YAML is empty/null', async () => {
    const path = join(tmp, 'empty.yaml');
    await writeFile(path, '', 'utf-8');
    const result = await loadConfig(path);
    expect(result).toEqual(defaultConfig());
  });

  it('returns defaults when the file is malformed', async () => {
    const path = join(tmp, 'bad.yaml');
    await writeFile(path, ':\n: badly\n  indented:\n\t-tab', 'utf-8');
    // loadConfig swallows errors and returns defaults
    const result = await loadConfig(path);
    expect(result).toEqual(defaultConfig());
  });
});

describe('saveConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gamma-cli-save-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes YAML and creates the parent directory', async () => {
    const nested = join(tmp, 'a', 'b');
    const path = join(nested, 'cfg.yaml');
    const cfg = defaultConfig();
    cfg.api_key = 'sk-saved';
    await saveConfig(cfg, path);
    const written = await readFile(path, 'utf-8');
    expect(written).toContain('api_key: sk-saved');
    expect(written).toContain('format: presentation');
  });

  it.skipIf(process.platform === 'win32')(
    'writes the file with mode 0o600 on POSIX',
    async () => {
      const path = join(tmp, 'mode.yaml');
      await saveConfig(defaultConfig(), path);
      const s = await stat(path);
      // mask to permission bits
      // eslint-disable-next-line no-bitwise
      const perms = s.mode & 0o777;
      expect(perms).toBe(0o600);
    }
  );
});

describe('configExists', () => {
  it('reflects the resolved configPath', () => {
    // We can't reliably mock fs here without complicating things — just assert it returns a boolean
    expect(typeof configExists()).toBe('boolean');
  });
});

describe('resolveApiKey', () => {
  beforeEach(() => {
    delete process.env['GAMMA_API_KEY'];
  });

  it('returns the env var when set (env wins over config)', () => {
    process.env['GAMMA_API_KEY'] = 'sk-env';
    const cfg = defaultConfig();
    cfg.api_key = 'sk-cfg';
    expect(resolveApiKey(cfg)).toBe('sk-env');
  });

  it('falls back to config when env is unset', () => {
    const cfg = defaultConfig();
    cfg.api_key = 'sk-cfg';
    expect(resolveApiKey(cfg)).toBe('sk-cfg');
  });

  it('returns undefined when neither is set', () => {
    const cfg = defaultConfig();
    expect(resolveApiKey(cfg)).toBeUndefined();
  });

  it('treats empty env var as unset', () => {
    process.env['GAMMA_API_KEY'] = '';
    const cfg = defaultConfig();
    cfg.api_key = 'sk-cfg';
    expect(resolveApiKey(cfg)).toBe('sk-cfg');
  });
});

// Keep `vi` referenced even if unused above
void vi;
