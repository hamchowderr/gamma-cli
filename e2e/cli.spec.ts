import { test, expect } from '@playwright/test';
import { runCli } from './helpers/run-cli';

/**
 * Offline-pure CLI smoke tests. These spawn the built binary and assert on
 * exit code + stdout/stderr. No network is touched — every test either runs
 * a help/version command, asks the CLI to inspect its own config, or trips a
 * validation error before any HTTP call is attempted.
 */

test.describe('gamma CLI — offline smoke', () => {
  test('--version exits 0 and prints 0.1.0', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
    expect(result.stderr).toBe('');
  });

  test('--help exits 0 and lists all command groups', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    // Each registered command group should appear.
    for (const cmd of [
      'generate',
      'generate-from-template',
      'status',
      'themes',
      'folders',
      'config',
    ]) {
      expect(result.stdout).toContain(cmd);
    }
  });

  test('--help-json exits 0 and emits valid JSON with required keys', async () => {
    const result = await runCli(['--help-json']);
    expect(result.exitCode).toBe(0);

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }, 'stdout should be valid JSON').not.toThrow();

    expect(parsed).toBeTruthy();
    const obj = parsed as Record<string, unknown>;
    expect(obj['name']).toBe('gamma');
    expect(obj).toHaveProperty('description');
    expect(obj).toHaveProperty('options');
    expect(Array.isArray(obj['options'])).toBe(true);
    expect(obj).toHaveProperty('subcommands');
    expect(Array.isArray(obj['subcommands'])).toBe(true);

    // Sanity: command groups should be discoverable in the JSON tree.
    const subcommandsJson = JSON.stringify(obj['subcommands']);
    for (const cmd of ['generate', 'status', 'themes', 'folders', 'config']) {
      expect(subcommandsJson).toContain(cmd);
    }
  });

  test('config show with no key set prints "(not set)" and exits 0', async () => {
    // No API key in env, no config file — the isolated HOME has no gamma-cli/config.yaml.
    const result = await runCli(['config', 'show'], { env: { GAMMA_API_KEY: '' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('(not set)');
  });

  test('generate with no args exits 1 and prints a usage error', async () => {
    const result = await runCli(['generate'], { env: { GAMMA_API_KEY: '' } });
    expect(result.exitCode).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined.toLowerCase()).toContain('prompt');
  });

  test('generate hi --cards 999 fails validation', async () => {
    const result = await runCli(['generate', 'hi', '--cards', '999'], {
      env: { GAMMA_API_KEY: '' },
    });
    expect(result.exitCode).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('--cards');
  });

  test('themes list without GAMMA_API_KEY errors out before any network call', async () => {
    const result = await runCli(['themes', 'list'], { env: { GAMMA_API_KEY: '' } });
    expect(result.exitCode).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('No API key found');
  });
});
