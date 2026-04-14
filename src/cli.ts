import { Command } from 'commander';
import type { GlobalOptions } from './commands/context.js';
import { registerGenerateCommands } from './commands/generate/index.js';
import { registerStatusCommand } from './commands/status/index.js';
import { registerThemesCommands } from './commands/themes/index.js';
import { registerFoldersCommands } from './commands/folders/index.js';
import { registerConfigCommands } from './commands/config/index.js';
import { printHelpJSON } from './commands/help-json.js';

export const program = new Command();

program
  .name('gamma')
  .description('Terminal client for Gamma API — create AI-powered presentations, documents, and more')
  .version('0.1.0')
  .option('--json', 'Output as JSON', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('-q, --quiet', 'Suppress non-essential output', false)
  .option('--no-color', 'Disable color output')
  .option('-c, --config <path>', 'Path to config file');

export function getGlobals(prog: Command): GlobalOptions {
  const opts = prog.opts();
  return {
    json: opts.json ?? false,
    verbose: opts.verbose ?? false,
    quiet: opts.quiet ?? false,
    noColor: opts.color === false,
    config: opts.config,
  };
}

registerGenerateCommands(program, getGlobals);
registerStatusCommand(program, getGlobals);
registerThemesCommands(program, getGlobals);
registerFoldersCommands(program, getGlobals);
registerConfigCommands(program, getGlobals);

if (process.argv.includes('--help-json')) {
  printHelpJSON(program);
  process.exit(0);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
