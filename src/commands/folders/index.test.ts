import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => {
  const foldersList = vi.fn();
  class GammaErrorMock extends Error {
    code = 'gamma_error';
    statusCode: number | undefined;
    constructor(message: string) {
      super(message);
      this.name = 'GammaError';
    }
  }
  return { foldersList, GammaErrorMock };
});

const { foldersList, GammaErrorMock } = mocks;

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
    themes: { list: vi.fn(), search: vi.fn() },
    folders: { list: mocks.foldersList, search: vi.fn() },
  })),
  GammaError: mocks.GammaErrorMock,
  isGenerationCompleted: () => false,
  isGenerationPending: () => false,
  isGenerationFailed: () => false,
}));

import { registerFoldersCommands } from './index.js';

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
  registerFoldersCommands(program, (prog) => {
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
    await program.parseAsync(['node', 'gamma', 'folders', ...args]);
  } catch {
    /* ignore */
  }
  cap.restore();
  return { exitCode: process.exitCode, cap };
}

beforeEach(() => {
  process.env['GAMMA_API_KEY'] = 'sk-test';
  process.exitCode = 0;
  foldersList.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('folders list — validation', () => {
  it('rejects --limit=0', async () => {
    const { exitCode } = await run(['list', '--limit', '0']);
    expect(exitCode).toBe(1);
    expect(foldersList).not.toHaveBeenCalled();
  });

  it('rejects non-numeric --limit', async () => {
    const { exitCode } = await run(['list', '--limit', 'abc']);
    expect(exitCode).toBe(1);
    expect(foldersList).not.toHaveBeenCalled();
  });
});

describe('folders list — single page', () => {
  it('passes limit and query through', async () => {
    foldersList.mockResolvedValueOnce({
      data: [{ id: 'f1', name: 'Folder One' }],
      hasMore: false,
      nextCursor: null,
    });
    const { exitCode, cap } = await run(['list', '--limit', '5', '--query', 'pre']);
    expect(exitCode).toBe(0);
    expect(foldersList.mock.calls[0]![0]).toMatchObject({ limit: 5, query: 'pre' });
    expect(cap.stdout.join('')).toContain('Folder One');
  });

  it('emits empty-folders message when query yields no results', async () => {
    foldersList.mockResolvedValueOnce({ data: [], hasMore: false, nextCursor: null });
    const { exitCode, cap } = await run(['list', '--query', 'zzz']);
    expect(exitCode).toBe(0);
    expect(cap.stdout.join('')).toMatch(/No folders matched your query/);
  });

  it('emits JSON array when --json is set', async () => {
    foldersList.mockResolvedValueOnce({
      data: [{ id: 'f1', name: 'F1' }],
      hasMore: false,
      nextCursor: null,
    });
    const program = buildProgram();
    const cap = captureStreams();
    process.exitCode = 0;
    try {
      await program.parseAsync(['node', 'gamma', '--json', 'folders', 'list']);
    } catch {
      /* ignore */
    }
    cap.restore();
    const parsed = JSON.parse(cap.stdout.join('').trim());
    expect(parsed).toEqual([{ id: 'f1', name: 'F1' }]);
  });
});

describe('folders list — pagination (--all)', () => {
  it('loops pages until hasMore=false', async () => {
    foldersList
      .mockResolvedValueOnce({
        data: [{ id: 'a', name: 'A' }],
        hasMore: true,
        nextCursor: 'cur-1',
      })
      .mockResolvedValueOnce({
        data: [{ id: 'b', name: 'B' }],
        hasMore: false,
        nextCursor: null,
      });

    const { exitCode } = await run(['list', '--all']);
    expect(exitCode).toBe(0);
    expect(foldersList).toHaveBeenCalledTimes(2);
    expect(foldersList.mock.calls[1]![0]).toMatchObject({ after: 'cur-1' });
  });

  it('stops on nextCursor=null even if hasMore=true', async () => {
    foldersList.mockResolvedValueOnce({
      data: [{ id: 'a', name: 'A' }],
      hasMore: true,
      nextCursor: null,
    });
    const { exitCode } = await run(['list', '--all']);
    expect(exitCode).toBe(0);
    expect(foldersList).toHaveBeenCalledTimes(1);
  });
});

describe('folders list — error handling', () => {
  it('handles GammaError → exit 1', async () => {
    foldersList.mockRejectedValueOnce(new GammaErrorMock('forbidden'));
    const { exitCode, cap } = await run(['list']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/forbidden/);
  });
});
