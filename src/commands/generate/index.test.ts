import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

// ----- SDK mock -----
// Hoist shared fns/classes so the vi.mock factory (which is hoisted above
// regular const declarations) can reference them.
const mocks = vi.hoisted(() => {
  const create = vi.fn();
  const createAndWait = vi.fn();
  const createFromTemplate = vi.fn();
  const createFromTemplateAndWait = vi.fn();
  const getStatus = vi.fn();
  const waitForCompletion = vi.fn();
  const themesList = vi.fn();
  const themesSearch = vi.fn();
  const foldersList = vi.fn();
  const foldersSearch = vi.fn();

  class GammaErrorMock extends Error {
    code: string;
    statusCode: number | undefined;
    requestId: string | undefined;
    override cause: Error | undefined;
    constructor(message: string, options: { code?: string; statusCode?: number } = {}) {
      super(message);
      this.code = options.code ?? 'gamma_error';
      this.statusCode = options.statusCode;
      this.requestId = undefined;
      this.cause = undefined;
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
    themesList,
    themesSearch,
    foldersList,
    foldersSearch,
    GammaErrorMock,
  };
});

const {
  create,
  createAndWait,
  GammaErrorMock,
} = mocks;

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
    themes: { list: mocks.themesList, search: mocks.themesSearch },
    folders: { list: mocks.foldersList, search: mocks.foldersSearch },
  })),
  GammaError: mocks.GammaErrorMock,
  isGenerationCompleted: () => false,
  isGenerationPending: () => false,
  isGenerationFailed: () => false,
}));

import { registerGenerateCommands } from './index.js';

// ----- Test helpers -----
const ORIGINAL_ENV = { ...process.env };
type Captured = { stdout: string[]; stderr: string[]; restore: () => void };
function captureStreams(): Captured {
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

  registerGenerateCommands(program, (prog) => {
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

async function runGenerate(args: string[]): Promise<{ exitCode: number | undefined; cap: Captured }> {
  const cap = captureStreams();
  const program = buildProgram();
  process.exitCode = 0;
  try {
    await program.parseAsync(['node', 'gamma', 'generate', ...args]);
  } catch {
    // commander throws on errors with exitOverride; tests assert via exitCode
  }
  cap.restore();
  return { exitCode: process.exitCode, cap };
}

beforeEach(() => {
  process.env['GAMMA_API_KEY'] = 'sk-test';
  process.exitCode = 0;
  create.mockReset();
  createAndWait.mockReset();
  // default: no-wait path returns a start response
  create.mockResolvedValue({ generationId: 'gen-1', warnings: undefined });
  createAndWait.mockResolvedValue({
    generationId: 'gen-1',
    gammaUrl: 'https://gamma.app/d/gen-1',
    credits: { deducted: 1, remaining: 999 },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('gamma generate — argument validation', () => {
  it('rejects --type=garbage', async () => {
    const { exitCode, cap } = await runGenerate(['hello', '--type', 'garbage', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid type "garbage"/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --text-mode=garbage', async () => {
    const { exitCode, cap } = await runGenerate(['hello', '--text-mode', 'garbage', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid text-mode "garbage"/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --cards=999 (out of range)', async () => {
    const { exitCode, cap } = await runGenerate(['hello', '--cards', '999', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--cards must be a number between 1 and 75/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --cards=0', async () => {
    const { exitCode } = await runGenerate(['hello', '--cards', '0', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects non-numeric --cards', async () => {
    const { exitCode } = await runGenerate(['hello', '--cards', 'abc', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --dimensions on --type=webpage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--type',
      'webpage',
      '--dimensions',
      '16x9',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--dimensions is not supported when --type=webpage/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --dimensions that does not match the format', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--type',
      'slides',
      '--dimensions',
      'a4',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --dimensions/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --header-footer with invalid JSON', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--header-footer',
      'not json',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--header-footer must be valid JSON/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --header-footer that parses to a non-object (array)', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--header-footer',
      '[]',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/must be a JSON object/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --header-footer when --type=webpage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--type',
      'webpage',
      '--header-footer',
      '{}',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--header-footer is not supported when --type=webpage/);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects --text-amount=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--text-amount',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --text-amount/);
  });

  it('rejects --image-source=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--image-source',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --image-source/);
  });

  it('rejects --card-split=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--card-split',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --card-split/);
  });

  it('rejects --export-as=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--export-as',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --export-as/);
  });

  it('rejects --workspace-access=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--workspace-access',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --workspace-access/);
  });

  it('rejects --external-access=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--external-access',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --external-access/);
  });

  it('rejects --share-access=garbage', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--share-access',
      'garbage',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Invalid --share-access/);
  });

  it('rejects --tone shorter than 1 char (empty)', async () => {
    const { exitCode, cap } = await runGenerate(['hello', '--tone', '', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--tone must be between/);
  });

  it('rejects --tone longer than 500 chars', async () => {
    const big = 'a'.repeat(501);
    const { exitCode, cap } = await runGenerate(['hello', '--tone', big, '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--tone must be between/);
  });

  it('rejects missing prompt', async () => {
    const { exitCode, cap } = await runGenerate(['--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Missing prompt/);
  });

  it('rejects both --from-file and prompt argument together', async () => {
    const { exitCode, cap } = await runGenerate([
      'literal-prompt',
      '--from-file',
      'somefile.txt',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/Cannot use both <prompt> argument and --from-file/);
  });

  it('rejects --timeout=0', async () => {
    const { exitCode, cap } = await runGenerate([
      'hello',
      '--timeout',
      '0',
      '--no-wait',
    ]);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/--timeout must be a positive number/);
  });
});

describe('gamma generate — request shape', () => {
  it('passes the bare minimum request when only prompt is given', async () => {
    await runGenerate(['hello world', '--no-wait']);
    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0]![0]!;
    expect(req).toMatchObject({
      inputText: 'hello world',
      textMode: 'generate',
      format: 'presentation',
      numCards: 10,
    });
    // Absent optional fields should not appear
    expect(req).not.toHaveProperty('folderIds');
    expect(req).not.toHaveProperty('themeId');
    expect(req).not.toHaveProperty('additionalInstructions');
  });

  it('maps repeated --folder to folderIds array', async () => {
    await runGenerate([
      'hi',
      '--folder',
      'a',
      '--folder',
      'b',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.folderIds).toEqual(['a', 'b']);
  });

  it('maps --additional-instructions', async () => {
    await runGenerate([
      'hi',
      '--additional-instructions',
      'be brief',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.additionalInstructions).toBe('be brief');
  });

  it('honors the --instructions alias when --additional-instructions is absent', async () => {
    await runGenerate(['hi', '--instructions', 'tone X', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.additionalInstructions).toBe('tone X');
  });

  it('maps --text-amount into textOptions.amount', async () => {
    await runGenerate(['hi', '--text-amount', 'brief', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.textOptions).toEqual({ amount: 'brief' });
  });

  it('maps --tone and --audience into textOptions', async () => {
    await runGenerate([
      'hi',
      '--tone',
      'witty',
      '--audience',
      'execs',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.textOptions).toMatchObject({ tone: 'witty', audience: 'execs' });
  });

  it('maps --language into textOptions.language', async () => {
    await runGenerate(['hi', '--language', 'es', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.textOptions).toMatchObject({ language: 'es' });
  });

  it('maps --image-source and --image-style into imageOptions', async () => {
    await runGenerate([
      'hi',
      '--image-source',
      'aiGenerated',
      '--image-style',
      'cinematic',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.imageOptions).toMatchObject({ source: 'aiGenerated', style: 'cinematic' });
  });

  it('maps --dimensions into cardOptions.dimensions when format supports it', async () => {
    await runGenerate([
      'hi',
      '--type',
      'slides',
      '--dimensions',
      '16x9',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.cardOptions).toMatchObject({ dimensions: '16x9' });
  });

  it('maps --header-footer JSON into cardOptions.headerFooter', async () => {
    await runGenerate([
      'hi',
      '--header-footer',
      '{"enabled":true}',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.cardOptions).toMatchObject({ headerFooter: { enabled: true } });
  });

  it('maps --card-split into cardSplit', async () => {
    await runGenerate(['hi', '--card-split', 'auto', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.cardSplit).toBe('auto');
  });

  it('maps --export-as into exportAs', async () => {
    await runGenerate(['hi', '--export-as', 'pdf', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.exportAs).toBe('pdf');
  });

  it('maps sharing options', async () => {
    await runGenerate([
      'hi',
      '--workspace-access',
      'view',
      '--external-access',
      'view',
      '--share-email',
      'a@b.com',
      '--share-email',
      'c@d.com',
      '--share-access',
      'comment',
      '--no-wait',
    ]);
    const req = create.mock.calls[0]![0]!;
    expect(req.sharingOptions).toEqual({
      workspaceAccess: 'view',
      externalAccess: 'view',
      emailOptions: { recipients: ['a@b.com', 'c@d.com'], access: 'comment' },
    });
  });

  it('maps --theme into themeId', async () => {
    await runGenerate(['hi', '--theme', 'theme-uuid', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.themeId).toBe('theme-uuid');
  });

  it('maps --type document to format=document', async () => {
    await runGenerate(['hi', '--type', 'document', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.format).toBe('document');
  });

  it('parses --cards into numCards', async () => {
    await runGenerate(['hi', '--cards', '20', '--no-wait']);
    const req = create.mock.calls[0]![0]!;
    expect(req.numCards).toBe(20);
  });
});

describe('gamma generate — wait vs no-wait', () => {
  it('--no-wait calls client.generations.create and prints generation ID', async () => {
    create.mockResolvedValueOnce({ generationId: 'gen-xyz' });
    const { cap, exitCode } = await runGenerate(['hi', '--no-wait']);
    expect(exitCode).toBe(0);
    expect(create).toHaveBeenCalled();
    expect(createAndWait).not.toHaveBeenCalled();
    const all = cap.stdout.join('') + cap.stderr.join('');
    expect(all).toContain('gen-xyz');
  });

  it('default (wait) calls client.generations.createAndWait and prints URL', async () => {
    createAndWait.mockResolvedValueOnce({
      generationId: 'gen-done',
      gammaUrl: 'https://gamma.app/d/gen-done',
      credits: { deducted: 2, remaining: 50 },
    });
    const { cap } = await runGenerate(['hi']);
    expect(createAndWait).toHaveBeenCalled();
    expect(cap.stdout.join('')).toContain('https://gamma.app/d/gen-done');
  });
});

describe('gamma generate — SDK error handling', () => {
  it('handles GammaError → exit 1, printError', async () => {
    create.mockRejectedValueOnce(new GammaErrorMock('rate limit hit'));
    const { exitCode, cap } = await runGenerate(['hi', '--no-wait']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/rate limit hit/);
  });

  it('handles TimeoutError → friendly message, exit 1', async () => {
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    createAndWait.mockRejectedValueOnce(err);
    const { exitCode, cap } = await runGenerate(['hi']);
    expect(exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/timed out/i);
  });
});

describe('gamma generate — JSON mode', () => {
  it('emits JSON for --no-wait success', async () => {
    create.mockResolvedValueOnce({ generationId: 'gen-1' });
    const program = buildProgram();
    const cap = captureStreams();
    process.exitCode = 0;
    try {
      await program.parseAsync(['node', 'gamma', '--json', 'generate', 'hi', '--no-wait']);
    } catch {
      /* ignore */
    }
    cap.restore();
    const parsed = JSON.parse(cap.stdout.join('').trim());
    expect(parsed).toEqual({ generationId: 'gen-1' });
  });
});
