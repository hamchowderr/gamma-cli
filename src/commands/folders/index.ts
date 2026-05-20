import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';
import type { Folder } from '@chowderr/gamma-sdk';

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
    .option('--all', 'Fetch every page until exhausted (ignores --limit)', false)
    .option('--cursor <token>', 'Start from a specific pagination cursor')
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
        const fetchAll = Boolean(opts.all);
        const cursor = opts.cursor as string | undefined;

        let allFolders: Folder[] = [];
        let hasMore = false;
        let nextCursor: string | null = null;

        if (fetchAll) {
          let after: string | undefined = cursor;
          while (true) {
            const page = await client.folders.list({
              ...(query ? { query } : {}),
              ...(after ? { after } : {}),
            });
            allFolders = allFolders.concat(page.data);
            if (!page.hasMore || !page.nextCursor) break;
            after = page.nextCursor;
          }
        } else {
          const page = await client.folders.list({
            ...(query ? { query } : {}),
            limit,
            ...(cursor ? { after: cursor } : {}),
          });
          allFolders = page.data;
          hasMore = page.hasMore;
          nextCursor = page.nextCursor;
        }

        const rows = allFolders.map((f) => ({
          ID: f.id,
          NAME: f.name,
        }));

        if (formatter.isJSON) {
          formatter.printJSON(allFolders);
        } else if (rows.length === 0) {
          formatter.printSuccess(query ? 'No folders matched your query.' : 'No folders found.');
        } else {
          formatter.printTable(rows);
          if (!fetchAll && hasMore && nextCursor) {
            formatter.verbose(`Next cursor: ${nextCursor}`);
          }
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

}
