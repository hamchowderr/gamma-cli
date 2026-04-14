import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { APP_NAME, defaultConfig } from './types.js';
import type { GammaConfig } from './types.js';

export function configDir(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) throw new Error('APPDATA environment variable not set');
    return join(appData, APP_NAME);
  }

  if (platform === 'darwin') {
    return join(process.env['HOME'] ?? '', 'Library', 'Application Support', APP_NAME);
  }

  const xdg = process.env['XDG_CONFIG_HOME'];
  const base = xdg ?? join(process.env['HOME'] ?? '', '.config');
  return join(base, APP_NAME);
}

export function configPath(): string {
  return join(configDir(), 'config.yaml');
}

export async function loadConfig(path?: string): Promise<GammaConfig> {
  const defaults = defaultConfig();
  const filePath = path ?? configPath();

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = parse(raw) as Partial<GammaConfig> | null;

    if (!parsed) return defaults;

    return {
      api_key: parsed.api_key ?? defaults.api_key,
      defaults: { ...defaults.defaults, ...parsed.defaults },
    };
  } catch {
    return defaults;
  }
}

export async function saveConfig(cfg: GammaConfig, path?: string): Promise<void> {
  const filePath = path ?? configPath();
  const dir = dirname(filePath);

  await mkdir(dir, { recursive: true });
  const content = stringify(cfg);
  await writeFile(filePath, content, { encoding: 'utf-8', mode: 0o600 });
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function resolveApiKey(config: GammaConfig): string | undefined {
  return process.env['GAMMA_API_KEY'] || config.api_key || undefined;
}
