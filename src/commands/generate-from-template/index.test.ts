import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => {
  const create = vi.fn();
  const createAndWait = vi.fn();
  const createFromTemplate = vi.fn();
  const createFromTemplateAndWait = vi.fn();
  const getStatus = vi.fn();
  const waitForCompletion = vi.fn();

  class GammaErrorMock extends Error {
    code: string;
    statusCode: number | undefined;
    constructor(message: string) {
      super(message);
      this.code = 'gamma_error';
      this.statusCode = undefined;
      this.name = 'GammaError';
    }
  }
  return {
    create,
    createAndWait,
    createFromTemplate,
    createFromTemplateAndWait,
    getStatus,
    waitForCompletion,
    GammaErrorMock,
  };
});

const { createFromTemplate, createFromTemplateAndWait, GammaErrorMock } = mocks;

vi.mock('@chowderr/gamma-sdk', () => ({
  GammaClient: vi.fn().mockImplementation(() => ({
    generations: {
      create: mocks.create,
      createAndWait: mocks.createAndWait,
      createFromTemplate: mocks.createFromTemplate,
      createFromTemplateAndWait: mocks.createFromTemplateAndWait,
      getStatus: mocks.getStatus,
      waitForCompletion: mocks.waitForCompletion,
    },
    themes: { list: vi.fn(), search: vi.fn() },
    folders: { list: vi.fn(), search: vi.fn() },
  })),
  GammaError: mocks.GammaErrorMock,
  isGenerationCompleted: () => false,
  isGenerationPending: () => false,
  isGenerationFailed: () => false,
}));

import { registerGenerateFromTemplateCommand } from './index.js';

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
  registerGenerateFromTemplateCommand(program, (prog) => {
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
    await program.parseAsync(['node', 'gamma', 'generate-from-template', ...args]);
  } catch {
    /* ignore */
  }
  cap.restore();
  return { exitCode: process.exitCode, cap };
}

beforeEach(() => {
  process.env['GAMMA_API_KEY'] = 'sk-test';
  process.exitCode = 0;
  createFromTemplate.mockResolvedValue({ generationId: 'gen-tpl-1' });
  createFromTemplateAndWait.mockResolvedValue({
    generationId: 'gen-tpl-1',
    gammaUrl: 'https://gamma.app/d/gen-tpl-1',
    credits: { deducted: 1, remaining: 99 },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('gamma generate-from-template — request shape', () => {
  it('passes the bare minimum request', async () => {
    await run(['g_template', 'hello', '--no-wait']);
    expect(createFromTemplate).toHaveBeenCalledTimes(1);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req).toMatchObject({
      gammaId: 'g_template',
      prompt: 'hello',
    });
    expect(req).not.toHaveProperty('folderIds');
    expect(req).not.toHaveProperty('themeId');
  });

  it('maps --theme to themeId', async () => {
    await run(['g_template', 'hello', '--theme', 'theme-uuid', '--no-wait']);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req.themeId).toBe('theme-uuid');
  });

  it('maps repeated --folder to folderIds', async () => {
    await run([
      'g_template',
      'hello',
      '--folder',
      'a',
      '--folder',
      'b',
      '--no-wait',
    ]);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req.folderIds).toEqual(['a', 'b']);
  });

  it('maps --export-as to exportAs', async () => {
    await run(['g_template', 'hello', '--export-as', 'pptx', '--no-wait']);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req.exportAs).toBe('pptx');
  });

  it('maps --image-style into imageOptions.style', async () => {
    await run(['g_template', 'hello', '--image-style', 'noir', '--no-wait']);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req.imageOptions).toMatchObject({ style: 'noir' });
  });

  it('maps sharing options', async () => {
    await run([
      'g_template',
      'hello',
      '--workspace-access',
      'edit',
      '--external-access',
      'view',
      '--share-email',
      'x@y.com',
      '--share-access',
      'view',
      '--no-wait',
    ]);
    const req = createFromTemplate.mock.calls[0]![0]!;
    expect(req.sharingOptions).toEqual({
      workspaceAccess: 'edit',
      externalAccess: 'view',
      emailOptions: { recipients: ['x@y.com'], access: 'view' },
    });
  });
});

describe('gamma generate-from-template — validation', () => {
  it('rejects --export-as=garbage', async () => {
    const { exitCode, cap } = await run([
      'g_template',
      'hello',
      '--export-as',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --export-as/);
    expect(createFromTemplate).not.toHaveBeenCalled();
  });

  it('rejects --image-style longer than 500 chars', async () => {
    const big = 'a'.repeat(501);
    const { exitCode, cap } = await run([
      'g_template',
      'hello',
      '--image-style',
      big,
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--image-style must be between/);
  });

  it('rejects --workspace-access=garbage', async () => {
    const { exitCode } = await run([
      'g_template',
      'hello',
      '--workspace-access',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
  });

  it('rejects --timeout=0', async () => {
    const { exitCode } = await run([
      'g_template',
      'hello',
      '--timeout',
      '0',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
  });

  it('rejects missing prompt (no arg, no --from-file)', async () => {
    const { exitCode, cap } = await run(['g_template', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Missing prompt/);
  });
});

describe('gamma generate-from-template — wait vs no-wait', () => {
  it('--no-wait calls createFromTemplate and prints generation ID', async () => {
    createFromTemplate.mockResolvedValueOnce({ generationId: 'gen-abc' });
    const { exitCode, cap } = await run(['g_template', 'hello', '--no-wait']);
    expect(exitCode).toBe(0);
    expect(createFromTemplate).toHaveBeenCalled();
    expect(createFromTemplateAndWait).not.toHaveBeenCalled();
    const all = cap.stdout.join('') + cap.stderr.join('');
    expect(all).toContain('gen-abc');
  });

  it('default (wait) calls createFromTemplateAndWait', async () => {
    createFromTemplateAndWait.mockResolvedValueOnce({
      generationId: 'gen-done',
      gammaUrl: 'https://gamma.app/d/gen-done',
      credits: { deducted: 3, remaining: 11 },
    });
    const { cap } = await run(['g_template', 'hello']);
    expect(createFromTemplateAndWait).toHaveBeenCalled();
    expect(cap.stdout.join('')).toContain('https://gamma.app/d/gen-done');
  });
});

describe('gamma generate-from-template — error handling', () => {
  it('handles GammaError → exit 1', async () => {
    createFromTemplate.mockRejectedValueOnce(new GammaErrorMock('forbidden'));
    const { exitCode, cap } = await run(['g_template', 'hello', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/forbidden/);
  });

  it('handles TimeoutError on wait path', async () => {
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    createFromTemplateAndWait.mockRejectedValueOnce(err);
    const { exitCode, cap } = await run(['g_template', 'hello']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/timed out/i);
  });
});
