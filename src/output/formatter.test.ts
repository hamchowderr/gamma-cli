import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Formatter } from './formatter.js';

function captureStreams(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
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

const ANSI_RE = /\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

describe('Formatter — JSON mode', () => {
  let cap: ReturnType<typeof captureStreams>;
  beforeEach(() => {
    cap = captureStreams();
  });
  afterEach(() => cap.restore());

  it('printJSON writes JSON to stdout', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printJSON({ ok: true, n: 1 });
    expect(cap.stdout.join('')).toBe('{\n  "ok": true,\n  "n": 1\n}\n');
  });

  it('isJSON reflects the option', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    expect(f.isJSON).toBe(true);
    const g = new Formatter({ json: false, verbose: false, quiet: false, noColor: false });
    expect(g.isJSON).toBe(false);
  });

  it('printError uses JSON envelope when json=true', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printError('something broke');
    const out = JSON.parse(cap.stdout.join('').trim());
    expect(out).toEqual({ success: false, error: 'something broke' });
    expect(cap.stderr.join('')).toBe('');
  });

  it('printError accepts an Error', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printError(new Error('boom'));
    const out = JSON.parse(cap.stdout.join('').trim());
    expect(out).toEqual({ success: false, error: 'boom' });
  });

  it('printSuccess writes JSON envelope when json=true', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printSuccess('ok');
    const out = JSON.parse(cap.stdout.join('').trim());
    expect(out).toEqual({ success: true, message: 'ok' });
  });

  it('printTable writes JSON when json=true', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printTable([{ a: 1, b: 'x' }]);
    expect(JSON.parse(cap.stdout.join('').trim())).toEqual([{ a: 1, b: 'x' }]);
  });

  it('printProgress / clearProgress are no-ops in JSON mode', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printProgress('working');
    f.clearProgress();
    expect(cap.stdout.join('')).toBe('');
    expect(cap.stderr.join('')).toBe('');
  });
});

describe('Formatter — plain text mode', () => {
  let cap: ReturnType<typeof captureStreams>;
  beforeEach(() => {
    cap = captureStreams();
  });
  afterEach(() => cap.restore());

  it('printError writes to stderr with Error: prefix', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.printError('bad');
    expect(stripAnsi(cap.stderr.join(''))).toBe('Error: bad\n');
    expect(cap.stdout.join('')).toBe('');
  });

  it('printSuccess writes a checkmark line to stdout', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.printSuccess('done');
    expect(stripAnsi(cap.stdout.join(''))).toContain('done');
  });

  it('printWarning writes to stderr with Warning: prefix', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.printWarning('careful');
    expect(stripAnsi(cap.stderr.join(''))).toBe('Warning: careful\n');
  });

  it('printTable formats columns to stdout', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.printTable([
      { ID: 'a', NAME: 'Alpha' },
      { ID: 'b', NAME: 'Beta' },
    ]);
    const out = stripAnsi(cap.stdout.join(''));
    expect(out).toContain('ID');
    expect(out).toContain('NAME');
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
  });

  it('printProgress writes a carriage-return line to stderr', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.printProgress('working');
    const err = stripAnsi(cap.stderr.join(''));
    expect(err).toContain('working');
    expect(err.endsWith('\r')).toBe(true);
  });

  it('clearProgress emits the clear-line escape to stderr', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.clearProgress();
    // raw value includes ANSI even when noColor — clearProgress uses literal escapes
    expect(cap.stderr.join('')).toBe('\x1b[2K\r');
  });
});

describe('Formatter — quiet suppression', () => {
  let cap: ReturnType<typeof captureStreams>;
  beforeEach(() => {
    cap = captureStreams();
  });
  afterEach(() => cap.restore());

  it('suppresses printSuccess', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: true, noColor: true });
    f.printSuccess('done');
    expect(cap.stdout.join('')).toBe('');
  });

  it('suppresses printWarning', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: true, noColor: true });
    f.printWarning('hmm');
    expect(cap.stderr.join('')).toBe('');
  });

  it('suppresses verbose and printProgress', () => {
    const f = new Formatter({ json: false, verbose: true, quiet: true, noColor: true });
    f.verbose('details');
    f.printProgress('working');
    f.clearProgress();
    expect(cap.stdout.join('')).toBe('');
    expect(cap.stderr.join('')).toBe('');
  });

  it('still emits printError (errors are not silenced by quiet)', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: true, noColor: true });
    f.printError('bad');
    expect(stripAnsi(cap.stderr.join(''))).toBe('Error: bad\n');
  });
});

describe('Formatter — verbose', () => {
  let cap: ReturnType<typeof captureStreams>;
  beforeEach(() => {
    cap = captureStreams();
  });
  afterEach(() => cap.restore());

  it('writes verbose lines to stderr when verbose=true', () => {
    const f = new Formatter({ json: false, verbose: true, quiet: false, noColor: true });
    f.verbose('hello');
    expect(stripAnsi(cap.stderr.join(''))).toBe('hello\n');
  });

  it('skips verbose when verbose=false', () => {
    const f = new Formatter({ json: false, verbose: false, quiet: false, noColor: true });
    f.verbose('hello');
    expect(cap.stderr.join('')).toBe('');
  });
});

describe('Formatter — color disable', () => {
  let cap: ReturnType<typeof captureStreams>;
  beforeEach(() => {
    cap = captureStreams();
  });
  afterEach(() => cap.restore());

  it('emits no ANSI codes when noColor=true', () => {
    const f = new Formatter({ json: false, verbose: true, quiet: false, noColor: true });
    f.printSuccess('hi');
    f.printWarning('careful');
    f.verbose('ok');
    const all = cap.stdout.join('') + cap.stderr.join('');
    expect(all.match(ANSI_RE)).toBeNull();
  });

  it('forces no-color when json=true regardless of noColor flag', () => {
    const f = new Formatter({ json: true, verbose: false, quiet: false, noColor: false });
    f.printError('err');
    const all = cap.stdout.join('') + cap.stderr.join('');
    // JSON output must not include color codes
    expect(all.match(ANSI_RE)).toBeNull();
  });
});
