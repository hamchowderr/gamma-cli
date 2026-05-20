import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => {
  const getStatus = vi.fn();
  const waitForCompletion = vi.fn();
  const isGenerationCompleted = vi.fn().mockReturnValue(false);
  const isGenerationPending = vi.fn().mockReturnValue(false);
  const isGenerationFailed = vi.fn().mockReturnValue(false);

  class GammaErrorMock extends Error {
    code = 'gamma_error';
    statusCode: number | undefined;
    constructor(message: string) {
      super(message);
      this.name = 'GammaError';
    }
  }
  return {
    getStatus,
    waitForCompletion,
    isGenerationCompleted,
    isGenerationPending,
    isGenerationFailed,
    GammaErrorMock,
  };
});

const {
  getStatus,
  waitForCompletion,
  isGenerationCompleted,
  isGenerationPending,
  isGenerationFailed,
  GammaErrorMock,
} = mocks;

vi.mock('@chowderr/gamma-sdk', () => ({
  GammaClient: vi.fn().mockImplementation(() => ({
    generations: {
      create: vi.fn(),
      createAndWait: vi.fn(),
      createFromTemplate: vi.fn(),
      createFromTemplateAndWait: vi.fn(),
      getStatus: mocks.getStatus,
      waitForCompletion: mocks.waitForCompletion,
    },
    themes: { list: vi.fn(), search: vi.fn() },
    folders: { list: vi.fn(), search: vi.fn() },
  })),
  GammaError: mocks.GammaErrorMock,
  isGenerationCompleted: mocks.isGenerationCompleted,
  isGenerationPending: mocks.isGenerationPending,
  isGenerationFailed: mocks.isGenerationFailed,
}));

import { registerStatusCommand } from './index.js';

const ORIGINAL_ENV = { ...process.env };

function captureStreams(): { stdout: string[]; stderr: string[]; restore: () => void } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
  return {
    stdout,
    stderr,
    restore: () => {
      outSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name('gamma')
    .option('--json', 'Output as JSON', false)
    .option('-v, --verbose', 'Verbose output', false)
    .option('-q, --quiet', 'Suppress non-essential output', false)
    .option('--no-color', 'Disable color output')
    .exitOverride();
  registerStatusCommand(program, (prog) => {
    const opts = prog.opts();
    return {
      json: opts.json ?? false,
      verbose: opts.verbose ?? false,
      quiet: opts.quiet ?? false,
      noColor: opts.color === false,
    };
  });
  return program;
}

async function run(args: string[]): Promise<{ exitCode: number | undefined; cap: ReturnType<typeof captureStreams> }> {
  const cap = captureStreams();
  const program = buildProgram();
  process.exitCode = 0;
  try {
    await program.parseAsync(['node', 'gamma', 'status', ...args]);
  } catch {
    /* ignore */
  }
  cap.restore();
  return { exitCode: process.exitCode, cap };
}

beforeEach(() => {
  process.env['GAMMA_API_KEY'] = 'sk-test';
  process.exitCode = 0;
  getStatus.mockReset();
  waitForCompletion.mockReset();
  isGenerationCompleted.mockReturnValue(false);
  isGenerationPending.mockReturnValue(false);
  isGenerationFailed.mockReturnValue(false);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('gamma status — without --wait', () => {
  it('calls getStatus with the generation id and prints completed details', async () => {
    isGenerationCompleted.mockReturnValueOnce(true);
    getStatus.mockResolvedValueOnce({
      status: 'completed',
      generationId: 'gen-1',
      gammaUrl: 'https://gamma.app/d/gen-1',
      credits: { deducted: 2 },
    });

    const { exitCode, cap } = await run(['gen-1']);
    expect(exitCode).toBe(0);
    expect(getStatus).toHaveBeenCalledWith('gen-1');
    expect(cap.stdout.join('')).toContain('Status: completed');
    expect(cap.stdout.join('')).toContain('https://gamma.app/d/gen-1');
  });

  it('prints pending message when status is pending', async () => {
    isGenerationPending.mockReturnValueOnce(true);
    getStatus.mockResolvedValueOnce({ status: 'pending', generationId: 'gen-1' });

    const { exitCode, cap } = await run(['gen-1']);
    expect(exitCode).toBe(0);
    expect(cap.stdout.join('')).toMatch(/Status: pending/);
    expect(cap.stdout.join('')).toMatch(/Run with --wait/);
  });

  it('prints failed error and exits 1 when status is failed', async () => {
    isGenerationFailed.mockReturnValueOnce(true);
    getStatus.mockResolvedValueOnce({
      status: 'failed',
      generationId: 'gen-1',
      error: { message: 'bad input', statusCode: 422 },
    });

    const { exitCode, cap } = await run(['gen-1']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Generation failed: bad input/);
  });

  it('emits JSON when --json is set', async () => {
    getStatus.mockResolvedValueOnce({ status: 'pending', generationId: 'gen-1' });
    const program = buildProgram();
    const cap = captureStreams();
    process.exitCode = 0;
    try {
      await program.parseAsync(['node', 'gamma', '--json', 'status', 'gen-1']);
    } catch {
      /* ignore */
    }
    cap.restore();
    const parsed = JSON.parse(cap.stdout.join('').trim());
    expect(parsed).toEqual({ status: 'pending', generationId: 'gen-1' });
  });
});

describe('gamma status — with --wait', () => {
  it('calls waitForCompletion and prints completed details', async () => {
    waitForCompletion.mockResolvedValueOnce({
      generationId: 'gen-1',
      gammaUrl: 'https://gamma.app/d/gen-1',
      credits: { deducted: 1 },
      pdfUrl: 'https://gamma.app/d/gen-1.pdf',
    });

    const { exitCode, cap } = await run(['gen-1', '--wait']);
    expect(exitCode).toBe(0);
    expect(waitForCompletion).toHaveBeenCalled();
    expect(waitForCompletion.mock.calls[0]![0]).toBe('gen-1');
    expect(cap.stdout.join('')).toContain('Status: completed');
    expect(cap.stdout.join('')).toContain('PDF: https://gamma.app/d/gen-1.pdf');
  });

  it('rejects --timeout=0 (parseTimeoutSeconds throws before any SDK call)', async () => {
    // status command re-throws non-GammaError/non-TimeoutError up to commander;
    // it does NOT print + exitCode = 1 itself for this validation. So we assert
    // the SDK was never called and the underlying error was raised.
    let thrown: unknown;
    const cap = captureStreams();
    const program = buildProgram();
    process.exitCode = 0;
    try {
      await program.parseAsync(['node', 'gamma', 'status', 'gen-1', '--wait', '--timeout', '0']);
    } catch (err) {
      thrown = err;
    }
    cap.restore();
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/--timeout must be a positive number/);
    expect(waitForCompletion).not.toHaveBeenCalled();
  });

  it('handles TimeoutError with a friendly message', async () => {
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    waitForCompletion.mockRejectedValueOnce(err);
    const { exitCode, cap } = await run(['gen-1', '--wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Polling timed out/);
  });
});

describe('gamma status — error handling', () => {
  it('handles GammaError → exit 1', async () => {
    getStatus.mockRejectedValueOnce(new GammaErrorMock('not found'));
    const { exitCode, cap } = await run(['gen-missing']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/not found/);
  });
});
