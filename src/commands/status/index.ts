import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import type { Formatter } from '../../output/formatter.js';
import { makeContext, makeClient } from '../context.js';
import {
  GammaError,
  isGenerationCompleted,
  isGenerationPending,
  isGenerationFailed,
} from '@chowderr/gamma-sdk';

export function registerStatusCommand(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  program
    .command('status')
    .description('Check generation progress')
    .argument('<generation-id>', 'Generation ID to check')
    .option('--wait', 'Poll until complete', false)
    .action(async (generationId: string, opts: { wait: boolean }, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;

      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const client = makeClient(ctx);
      const { formatter } = ctx;

      try {
        if (opts.wait) {
          const result = await client.generations.waitForCompletion(generationId, {
            onProgress: (progress) => {
              formatter.printProgress(
                `Polling... (attempt ${progress.pollCount}, ${Math.round(progress.elapsedMs / 1000)}s elapsed)`
              );
            },
          });

          formatter.clearProgress();

          if (globals.json) {
            formatter.printJSON(result);
          } else {
            printCompleted(formatter, result);
          }
        } else {
          const status = await client.generations.getStatus(generationId);

          if (globals.json) {
            formatter.printJSON(status);
          } else if (isGenerationCompleted(status)) {
            printCompleted(formatter, status);
          } else if (isGenerationPending(status)) {
            process.stdout.write(`Status: pending\nGeneration ${generationId} is still in progress.\n`);
            process.stdout.write('Run with --wait to poll until complete.\n');
          } else if (isGenerationFailed(status)) {
            formatter.printError(
              `Generation failed: ${status.error.message} (status ${status.error.statusCode})`
            );
            process.exitCode = 1;
          }
        }
      } catch (err) {
        if (err instanceof GammaError) {
          formatter.printError(err);
          process.exitCode = 1;
        } else {
          throw err;
        }
      }
    });
}

function printCompleted(
  formatter: Formatter,
  result: { generationId: string; gammaUrl: string; credits: { deducted: number }; pdfUrl?: string; pptxUrl?: string; warnings?: string }
): void {
  process.stdout.write(`Status: completed\n`);
  process.stdout.write(`URL: ${result.gammaUrl}\n`);
  process.stdout.write(`Credits used: ${result.credits.deducted}\n`);
  if (result.pdfUrl) process.stdout.write(`PDF: ${result.pdfUrl}\n`);
  if (result.pptxUrl) process.stdout.write(`PPTX: ${result.pptxUrl}\n`);
  if (result.warnings) {
    formatter.verbose(`Warnings: ${result.warnings}`);
  }
}
