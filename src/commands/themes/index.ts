import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';

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
          ? await client.themes.search(query, { limit })
          : await client.themes.list({ limit });

        if (formatter.isJSON) {
          formatter.printJSON(page.data);
          return;
        }

        if (page.data.length === 0) {
          formatter.printWarning(query ? `No themes matching "${query}"` : 'No themes found');
          return;
        }

        const rows = page.data.map((t: { id: string; name: string; colorKeywords?: string[] }) => ({
          ID: t.id,
          NAME: t.name,
          COLORS: (t.colorKeywords ?? []).join(', '),
        }));

        formatter.printTable(rows);

        if (page.hasMore) {
          formatter.verbose(`Showing ${page.data.length} of more results. Use --limit to adjust.`);
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

  themes
    .command('get')
    .description('Get theme details by UUID')
    .argument('<id>', 'Theme UUID')
    .action(async (id: string, _opts: Record<string, unknown>, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const { formatter } = ctx;

      try {
        const client = makeClient(ctx);

        const all = await client.themes.listAll();
        const theme = all.find((t: { id: string }) => t.id === id);

        if (!theme) {
          formatter.printError(`Theme not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        if (formatter.isJSON) {
          formatter.printJSON(theme);
          return;
        }

        process.stdout.write(`  ID:      ${theme.id}\n`);
        process.stdout.write(`  Name:    ${theme.name}\n`);
        process.stdout.write(`  Colors:  ${(theme.colorKeywords ?? []).join(', ') || '(none)'}\n`);
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
