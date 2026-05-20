import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';
import type { Theme } from '@chowderr/gamma-sdk';

export function registerThemesCommands(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  const themes = program.command('themes').description('Manage themes');

  themes
    .command('list')
    .description('List available themes')
    .option('--query <text>', 'Search themes by name')
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

        let allThemes: Theme[] = [];
        let hasMore = false;
        let nextCursor: string | null = null;

        if (fetchAll) {
          let after: string | undefined = cursor;
          // Loop until no more pages
          while (true) {
            const page = await client.themes.list({
              ...(query ? { query } : {}),
              ...(after ? { after } : {}),
            });
            allThemes = allThemes.concat(page.data);
            if (!page.hasMore || !page.nextCursor) break;
            after = page.nextCursor;
          }
        } else {
          const page = await client.themes.list({
            ...(query ? { query } : {}),
            limit,
            ...(cursor ? { after: cursor } : {}),
          });
          allThemes = page.data;
          hasMore = page.hasMore;
          nextCursor = page.nextCursor;
        }

        if (formatter.isJSON) {
          formatter.printJSON(allThemes);
          return;
        }

        if (allThemes.length === 0) {
          formatter.printWarning(query ? `No themes matching "${query}"` : 'No themes found');
          return;
        }

        const rows = allThemes.map((t) => ({
          ID: t.id,
          NAME: t.name,
          COLORS: (t.colorKeywords ?? []).join(', '),
        }));

        formatter.printTable(rows);

        if (!fetchAll && hasMore) {
          formatter.verbose(`Showing ${allThemes.length} of more results. Use --limit to adjust.`);
          if (nextCursor) {
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
