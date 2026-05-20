import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// e2e/helpers/ -> repo root
export const REPO_ROOT = path.resolve(here, '..', '..');
export const CLI_ENTRY = path.join(REPO_ROOT, 'dist', 'cli.js');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunCliOptions {
  /**
   * Environment variables to merge with process.env. To unset an inherited
   * variable, pass an empty string (`{ GAMMA_API_KEY: '' }`).
   */
  env?: Record<string, string>;
  /** Optional stdin content piped to the child. */
  stdin?: string;
  /** Working directory for the child. Defaults to repo root. */
  cwd?: string;
  /** Hard timeout in ms; default 15s. */
  timeoutMs?: number;
}

/**
 * Spawn the built gamma CLI with the given args and capture output.
 * The child runs the actual dist/cli.js — make sure to `npm run build` first.
 *
 * The child's HOME / APPDATA are pointed at an empty per-process temp dir so
 * the user's real config file (~/AppData/Roaming/gamma-cli/config.yaml) does
 * not leak into tests.
 */
export function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const isolated = path.join(REPO_ROOT, 'e2e', '.tmp-home');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Isolate from user's real config. The CLI computes its config dir from
      // APPDATA (win32) / HOME (linux/mac); point both at an empty scratch dir.
      APPDATA: isolated,
      HOME: isolated,
      XDG_CONFIG_HOME: isolated,
      ...options.env,
    };

    // Drop empty-string keys so callers can explicitly "unset" a var with `''`.
    for (const [k, v] of Object.entries(env)) {
      if (v === '') delete env[k];
    }

    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd: options.cwd ?? REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    const timeoutMs = options.timeoutMs ?? 15_000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`runCli timed out after ${timeoutMs}ms\nargs: ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}
