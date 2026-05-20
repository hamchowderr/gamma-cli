import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => {
  const themesList = vi.fn();
  class GammaErrorMock extends Error {
    code = 'gamma_error';
    statusCode: number | undefined;
    constructor(message: string) {
      super(message);
      this.name = 'GammaError';
    }
  }
  return { themesList, GammaErrorMock };
});

const { themesList, GammaErrorMock } = mocks;

vi.mock('@chowderr/gamma-sdk', () => ({
  GammaClient: vi.fn().mockImplementation(() => ({
    generations: {
      create: vi.fn(),
      createAndWait: vi.fn(),
      createFromTemplate: vi.fn(),
      createFromTemplateAndWait: vi.fn(),
      getStatus: vi.fn(),
      waitForCompletion: vi.fn(),
    },
    themes: { list: mocks.themesList, search: vi.fn() },
    folders: { list: vi.fn(), search: vi.fn() },
  })),
  GammaError: mocks.GammaErrorMock,
  isGenerationCompleted: () => false,
  isGenerationPending: () => false,
  isGenerationFailed: () => false,
}));

import { registerThemesCommands } from './index.js';

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
  registerThemesCommands(program, (prog) => {
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
    await program.parseAsync(['node', 'gamma', 'themes', ...args]);
  } catch {
    /* ignore */
  }
  cap.restore();
  return { exitCode: process.exitCode, cap };
}

beforeEach(() => {
  process.env['GAMMA_API_KEY'] = 'sk-test';
  process.exitCode = 0;
  themesList.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('themes list — validation', () => {
  it('rejects --limit=0', async () => {
    const { exitCode, cap } = await run(['list', '--limit', '0']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--limit must be a positive number/);
    expect(themesList).not.toHaveBeenCalled();
  });

  it('rejects non-numeric --limit', async () => {
    const { exitCode } = await run(['list', '--limit', 'abc']);
    expect(exitCode).toBe(1);
    expect(themesList).not.toHaveBeenCalled();
  });
});

describe('themes list — single page', () => {
  it('passes limit and (optional) query', async () => {
    themesList.mockResolvedValueOnce({
      data: [{ id: 't1', name: 'Theme One', colorKeywords: ['blue'] }],
      hasMore: false,
      nextCursor: null,
    });
    const { exitCode, cap } = await run(['list', '--limit', '5', '--query', 'pink']);
    expect(exitCode).toBe(0);
    expect(themesList).toHaveBeenCalledTimes(1);
    expect(themesList.mock.calls[0]![0]).toMatchObject({ limit: 5, query: 'pink' });
    expect(cap.stdout.join('')).toContain('Theme One');
  });

  it('emits JSON array when --json is set', async () => {
    themesList.mockResolvedValueOnce({
      data: [{ id: 't1', name: 'One', colorKeywords: [] }],
      hasMore: false,
      nextCursor: null,
    });
    const program = buildProgram();
    const cap = captureStreams();
    process.exitCode = 0;
    try {
      await program.parseAsync(['node', 'gamma', '--json', 'themes', 'list']);
    } catch {
      /* ignore */
    }
    cap.restore();
    const parsed = JSON.parse(cap.stdout.join('').trim());
    expect(parsed).toEqual([{ id: 't1', name: 'One', colorKeywords: [] }]);
  });

  it('warns when no themes match a query', async () => {
    themesList.mockResolvedValueOnce({ data: [], hasMore: false, nextCursor: null });
    const { exitCode, cap } = await run(['list', '--query', 'zzz']);
    expect(exitCode).toBe(0);
    expect(cap.stderr.join('')).toMatch(/No themes matching "zzz"/);
  });
});

describe('themes list — pagination (--all)', () => {
  it('loops over pages with the nextCursor until hasMore=false', async () => {
    themesList
      .mockResolvedValueOnce({
        data: [{ id: 'a', name: 'A', colorKeywords: [] }],
        hasMore: true,
        nextCursor: 'cur-1',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'b', name: 'B', colorKeywords: [] }],
        hasMore: true,
        nextCursor: 'cur-2',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'c', name: 'C', colorKeywords: [] }],
        hasMore: false,
        nextCursor: null,
      });

    const { exitCode, cap } = await run(['list', '--all']);
    expect(exitCode).toBe(0);
    expect(themesList).toHaveBeenCalledTimes(3);
    // first call has no `after`
    expect(themesList.mock.calls[0]![0]).not.toHaveProperty('after');
    // second/third use cursors
    expect(themesList.mock.calls[1]![0]).toMatchObject({ after: 'cur-1' });
    expect(themesList.mock.calls[2]![0]).toMatchObject({ after: 'cur-2' });
    const out = cap.stdout.join('');
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('c');
  });

  it('seeds pagination with --cursor when used with --all', async () => {
    themesList.mockResolvedValueOnce({
      data: [{ id: 'x', name: 'X', colorKeywords: [] }],
      hasMore: false,
      nextCursor: null,
    });
    await run(['list', '--all', '--cursor', 'seed-cursor']);
    expect(themesList.mock.calls[0]![0]).toMatchObject({ after: 'seed-cursor' });
  });
});

describe('themes list — error handling', () => {
  it('handles GammaError → exit 1', async () => {
    themesList.mockRejectedValueOnce(new GammaErrorMock('unauthorized'));
    const { exitCode, cap } = await run(['list']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/unauthorized/);
  });

  it('handles generic Error → exit 1', async () => {
    themesList.mockRejectedValueOnce(new Error('network down'));
    const { exitCode, cap } = await run(['list']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/network down/);
  });
});
