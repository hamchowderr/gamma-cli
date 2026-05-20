import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';
import type { GenerateFromTemplateRequest, TemplateImageOptions } from '@chowderr/gamma-sdk';
import {
  buildSharingOptions,
  collect,
  parseTimeoutSeconds,
  resolvePromptInput,
  validateBoundedString,
  validateExportFormat,
  validateExternalAccess,
  validateShareAccess,
  validateWorkspaceAccess,
} from '../generate/helpers.js';

const DEFAULT_TIMEOUT_SECONDS = 600;

export function registerGenerateFromTemplateCommand(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  program
    .command('generate-from-template')
    .description('Generate a gamma from an existing template (beta)')
    .argument('<gamma-id>', 'Template gamma ID (e.g. g_abcdef123456)')
    .argument('[prompt]', 'Text prompt (use "-" to read from stdin)')
    .option('--from-file <path>', 'Read prompt from a file')
    .option('--theme <id>', 'Override the template theme')
    .option('--folder <id>', 'Save to folder UUID (repeatable)', collect, [])
    .option('--export-as <format>', 'Export format: pdf or pptx')
    .option('--image-model <model>', 'AI image model (only used if template uses AI images)')
    .option('--image-style <text>', 'Artistic style for AI images (<=500 chars)')
    .option('--workspace-access <level>', 'Workspace access: noAccess, view, comment, edit, fullAccess')
    .option('--external-access <level>', 'External access: noAccess, view, comment, edit')
    .option('--share-email <addr>', 'Email to share with (repeatable)', collect, [])
    .option('--share-access <level>', 'Access for --share-email recipients: view, comment, edit, fullAccess')
    .option('--timeout <seconds>', 'Polling timeout in seconds', String(DEFAULT_TIMEOUT_SECONDS))
    .option('--wait', 'Wait for generation to complete (default)', true)
    .option('--no-wait', 'Return generation ID immediately without waiting')
    .action(
      async (
        gammaId: string,
        promptArg: string | undefined,
        opts: Record<string, unknown>,
        cmd: Command
      ) => {
        let root = cmd;
        while (root.parent) root = root.parent;
        const globals = getGlobals(root);
        const ctx = await makeContext(globals);
        const { formatter } = ctx;

        try {
          const prompt = await resolvePromptInput(
            promptArg,
            opts.fromFile as string | undefined
          );

          const folderIds = Array.isArray(opts.folder) ? (opts.folder as string[]) : [];
          const exportAs = validateExportFormat(opts.exportAs as string | undefined);

          const imageModel = opts.imageModel as string | undefined;
          const imageStyle = validateBoundedString(
            opts.imageStyle as string | undefined,
            '--image-style'
          );
          const imageOptions: TemplateImageOptions = {};
          if (imageModel !== undefined) {
            (imageOptions as { model?: string }).model = imageModel;
          }
          if (imageStyle !== undefined) imageOptions.style = imageStyle;

          const workspaceAccess = validateWorkspaceAccess(opts.workspaceAccess as string | undefined);
          const externalAccess = validateExternalAccess(opts.externalAccess as string | undefined);
          const shareEmails = Array.isArray(opts.shareEmail) ? (opts.shareEmail as string[]) : [];
          const shareAccess = validateShareAccess(opts.shareAccess as string | undefined);
          const sharingOptions = buildSharingOptions({
            workspaceAccess,
            externalAccess,
            shareEmails,
            shareAccess,
          });

          const timeoutSeconds = parseTimeoutSeconds(
            opts.timeout as string | undefined,
            DEFAULT_TIMEOUT_SECONDS
          );

          const request: GenerateFromTemplateRequest = {
            gammaId,
            prompt,
            ...(opts.theme ? { themeId: opts.theme as string } : {}),
            ...(folderIds.length > 0 ? { folderIds } : {}),
            ...(exportAs ? { exportAs } : {}),
            ...(Object.keys(imageOptions).length > 0 ? { imageOptions } : {}),
            ...(sharingOptions ? { sharingOptions } : {}),
          };

          const client = makeClient(ctx);
          const shouldWait = opts.wait as boolean;

          if (!shouldWait) {
            const start = await client.generations.createFromTemplate(request);

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

          const result = await client.generations.createFromTemplateAndWait(request, {
            onProgress: (progress) => {
              const elapsed = Math.round((progress.elapsedMs ?? 0) / 1000);
              formatter.printProgress(
                `${progress.status ?? 'generating'}... (${elapsed}s, poll #${progress.pollCount ?? 0})`
              );
            },
            signal: AbortSignal.timeout(timeoutSeconds * 1000),
          });

          formatter.clearProgress();

          if (formatter.isJSON) {
            formatter.printJSON(result);
          } else {
            formatter.printSuccess('Generation complete!');
            process.stdout.write(`  URL:      ${result.gammaUrl}\n`);
            if (result.pdfUrl) {
              process.stdout.write(`  PDF:      ${result.pdfUrl}\n`);
            }
            if (result.pptxUrl) {
              process.stdout.write(`  PPTX:     ${result.pptxUrl}\n`);
            }
            process.stdout.write(
              `  Credits:  ${result.credits?.deducted ?? 0} used, ${result.credits?.remaining ?? '?'} remaining\n`
            );
            process.stdout.write(`  ID:       ${result.generationId}\n`);
          }
        } catch (err) {
          if (err instanceof GammaError) {
            formatter.printError(err);
            process.exitCode = 1;
          } else if (err instanceof Error && err.name === 'TimeoutError') {
            formatter.printError('Generation timed out. Use "gamma status <id>" to check progress.');
            process.exitCode = 1;
          } else {
            formatter.printError(err instanceof Error ? err : String(err));
            process.exitCode = 1;
          }
        }
      }
    );
}
