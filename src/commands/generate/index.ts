import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';

const TYPE_MAP: Record<string, string> = {
  slides: 'presentation',
  document: 'document',
  social: 'social',
  webpage: 'webpage',
};

export function registerGenerateCommands(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  program
    .command('generate')
    .description('Generate a presentation, document, or other content from a prompt')
    .argument('<prompt>', 'Text prompt describing what to generate (1-400k chars)')
    .option(
      '--type <type>',
      'Output type: slides, document, social, webpage',
      'slides'
    )
    .option(
      '--text-mode <mode>',
      'Text handling: generate, condense, preserve',
      'generate'
    )
    .option('--theme <id>', 'Theme UUID')
    .option('--folder <id>', 'Save to folder UUID')
    .option('--language <code>', 'Output language code')
    .option('--cards <n>', 'Number of cards/slides (1-75)', '10')
    .option('--instructions <text>', 'Additional AI instructions')
    .option('--wait', 'Wait for generation to complete (default)', true)
    .option('--no-wait', 'Return generation ID immediately without waiting')
    .action(async (prompt: string, opts: Record<string, unknown>, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const { formatter } = ctx;

      try {
        const client = makeClient(ctx);

        const typeValue = opts.type as string;
        if (!TYPE_MAP[typeValue]) {
          formatter.printError(`Invalid type "${typeValue}". Must be one of: slides, document, social, webpage`);
          process.exitCode = 1;
          return;
        }

        const textMode = opts.textMode as string;
        if (!['generate', 'condense', 'preserve'].includes(textMode)) {
          formatter.printError(`Invalid text-mode "${textMode}". Must be one of: generate, condense, preserve`);
          process.exitCode = 1;
          return;
        }

        const numCards = parseInt(opts.cards as string, 10);
        if (isNaN(numCards) || numCards < 1 || numCards > 75) {
          formatter.printError('--cards must be a number between 1 and 75');
          process.exitCode = 1;
          return;
        }

        const format = TYPE_MAP[typeValue];

        const createParams: Record<string, unknown> = {
          inputText: prompt,
          textMode,
          format,
          numCards,
        };

        if (opts.theme) createParams.themeId = opts.theme;
        if (opts.instructions) createParams.instructions = opts.instructions;
        if (opts.language) createParams.language = opts.language;
        if (opts.folder) createParams.folderId = opts.folder;

        const shouldWait = opts.wait as boolean;

        if (!shouldWait) {
          const start = await client.generations.create(createParams as Parameters<typeof client.generations.create>[0]);

          if (formatter.isJSON) {
            formatter.printJSON(start);
          } else {
            formatter.printSuccess(`Generation started: ${start.generationId}`);
            if (start.warnings) {
              for (const w of start.warnings) {
                formatter.printWarning(String(w));
              }
            }
          }
          return;
        }

        // Wait mode: poll with progress
        const result = await client.generations.createAndWait(
          createParams as Parameters<typeof client.generations.createAndWait>[0],
          {
            onProgress: (progress) => {
              const elapsed = Math.round((progress.elapsedMs ?? 0) / 1000);
              formatter.printProgress(
                `${progress.status ?? 'generating'}... (${elapsed}s, poll #${progress.pollCount ?? 0})`
              );
            },
            signal: AbortSignal.timeout(600_000),
          }
        );

        formatter.clearProgress();

        if (formatter.isJSON) {
          formatter.printJSON(result);
        } else {
          formatter.printSuccess('Generation complete!');
          process.stdout.write(`  URL:      ${result.gammaUrl}\n`);
          if (result.pdfUrl) {
            process.stdout.write(`  PDF:      ${result.pdfUrl}\n`);
          }
          process.stdout.write(`  Credits:  ${result.credits?.deducted ?? 0} used, ${result.credits?.remaining ?? '?'} remaining\n`);
          process.stdout.write(`  ID:       ${result.generationId}\n`);
        }
      } catch (err) {
        if (err instanceof GammaError) {
          formatter.printError(err);
          process.exitCode = 1;
        } else if (err instanceof Error && err.name === 'TimeoutError') {
          formatter.printError('Generation timed out after 10 minutes. Use "gamma status <id>" to check progress.');
          process.exitCode = 1;
        } else {
          formatter.printError(err instanceof Error ? err : String(err));
          process.exitCode = 1;
        }
      }
    });
}
