import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';

export function registerFoldersCommands(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  const folders = program.command('folders').description('Manage folders');

  folders
    .command('list')
    .description('List folders')
    .option('--query <text>', 'Search folders by name')
    .option('--limit <n>', 'Max results', '25')
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const { formatter } = ctx;

      try {
        const client = makeClient(ctx);

        const limit = parseInt(opts.limit as string, 10);
        if (isNaN(limit) || limit < 1) {
          formatter.printError('--limit must be a positive number');
          process.exitCode = 1;
          return;
        }

        const query = opts.query as string | undefined;

        const page = query
          ? await client.folders.search(query, { limit })
          : await client.folders.list({ limit });

        const rows = page.data.map((f: { id: string; name: string }) => ({
          ID: f.id,
          NAME: f.name,
        }));

        if (formatter.isJSON) {
          formatter.printJSON(page.data);
        } else if (rows.length === 0) {
          formatter.printSuccess(query ? 'No folders matched your query.' : 'No folders found.');
        } else {
          formatter.printTable(rows);
        }
      } catch (err) {
        if (err instanceof GammaError) {
          formatter.printError(err);
        } else {
          formatter.printError(err instanceof Error ? err : String(err));
        }
        process.exitCode = 1;
      }
    });

  folders
    .command('create')
    .description('Create a new folder')
    .argument('<name>', 'Folder name')
    .action(async (_name: string, _opts: Record<string, unknown>, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const { formatter } = ctx;

      if (formatter.isJSON) {
        formatter.printJSON({
          success: false,
          error: 'Folder creation is not yet supported by the Gamma API.',
        });
      } else {
        formatter.printError(
          'Folder creation is not yet supported by the Gamma API. Create folders at https://gamma.app'
        );
      }
      process.exitCode = 1;
    });
}
