import type { Command } from 'commander';
import { Option } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext, makeClient } from '../context.js';
import { GammaError } from '@chowderr/gamma-sdk';
import type {
  CardOptions,
  Format,
  GenerateRequest,
  ImageOptions,
  TextMode,
  TextOptions,
} from '@chowderr/gamma-sdk';
import {
  buildSharingOptions,
  collect,
  parseHeaderFooter,
  parseTimeoutSeconds,
  resolvePromptInput,
  validateCardSplit,
  validateDimensions,
  validateExportFormat,
  validateExternalAccess,
  validateImageSource,
  validateBoundedString,
  validateShareAccess,
  validateTextAmount,
  validateWorkspaceAccess,
} from './helpers.js';

const TYPE_MAP: Record<string, Format> = {
  slides: 'presentation',
  document: 'document',
  social: 'social',
  webpage: 'webpage',
};

const DEFAULT_TIMEOUT_SECONDS = 600;

export function registerGenerateCommands(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  program
    .command('generate')
    .description('Generate a presentation, document, or other content from a prompt')
    .argument('[prompt]', 'Text prompt (use "-" to read from stdin)')
    .option('--from-file <path>', 'Read prompt from a file')
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
    .option('--folder <id>', 'Save to folder UUID (repeatable)', collect, [])
    .option('--language <code>', 'Output language code')
    .option('--cards <n>', 'Number of cards/slides (1-75)', '10')
    .option('--additional-instructions <text>', 'Additional AI instructions')
    .addOption(new Option('--instructions <text>', 'Alias for --additional-instructions').hideHelp())
    .option('--text-amount <amount>', 'Text density: brief, medium, detailed, extensive')
    .option('--tone <text>', 'Text tone/voice (<=500 chars)')
    .option('--audience <text>', 'Target audience description (<=500 chars)')
    .option('--image-source <source>', 'Image source enum (e.g. aiGenerated, pexels, noImages)')
    .option('--image-model <model>', 'AI image model (when --image-source=aiGenerated)')
    .option('--image-style <text>', 'Artistic style for AI images (<=500 chars)')
    .option('--dimensions <value>', 'Card dimensions (format-dependent, e.g. 16x9, a4, 9x16)')
    .option('--card-split <mode>', 'Card splitting: auto or inputTextBreaks')
    .option('--header-footer <json>', 'Header/footer config as JSON')
    .option('--export-as <format>', 'Export format: pdf or pptx')
    .option('--workspace-access <level>', 'Workspace access: noAccess, view, comment, edit, fullAccess')
    .option('--external-access <level>', 'External access: noAccess, view, comment, edit')
    .option('--share-email <addr>', 'Email to share with (repeatable)', collect, [])
    .option('--share-access <level>', 'Access for --share-email recipients: view, comment, edit, fullAccess')
    .option('--timeout <seconds>', 'Polling timeout in seconds', String(DEFAULT_TIMEOUT_SECONDS))
    .option('--wait', 'Wait for generation to complete (default)', true)
    .option('--no-wait', 'Return generation ID immediately without waiting')
    .action(async (promptArg: string | undefined, opts: Record<string, unknown>, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);
      const { formatter } = ctx;

      try {
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

        const format = TYPE_MAP[typeValue]!;

        const prompt = await resolvePromptInput(
          promptArg,
          opts.fromFile as string | undefined
        );

        const folderIds = Array.isArray(opts.folder) ? (opts.folder as string[]) : [];
        const additionalInstructions =
          (opts.additionalInstructions as string | undefined) ??
          (opts.instructions as string | undefined);

        const textAmount = validateTextAmount(opts.textAmount as string | undefined);
        const tone = validateBoundedString(opts.tone as string | undefined, '--tone');
        const audience = validateBoundedString(opts.audience as string | undefined, '--audience');
        const language = opts.language as string | undefined;

        const imageSource = validateImageSource(opts.imageSource as string | undefined);
        const imageModel = opts.imageModel as string | undefined;
        const imageStyle = validateBoundedString(
          opts.imageStyle as string | undefined,
          '--image-style'
        );

        const dimensions = validateDimensions(opts.dimensions as string | undefined, format);
        const cardSplit = validateCardSplit(opts.cardSplit as string | undefined);
        const headerFooter = parseHeaderFooter(opts.headerFooter as string | undefined, format);

        const exportAs = validateExportFormat(opts.exportAs as string | undefined);

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

        const textOptions: TextOptions = {};
        if (textAmount !== undefined) textOptions.amount = textAmount;
        if (tone !== undefined) textOptions.tone = tone;
        if (audience !== undefined) textOptions.audience = audience;
        if (language !== undefined) {
          // Cast to satisfy LanguageCode literal union; SDK / API will validate at runtime.
          (textOptions as { language?: string }).language = language;
        }

        const imageOptions: ImageOptions = {};
        if (imageSource !== undefined) imageOptions.source = imageSource;
        if (imageModel !== undefined) {
          // Cast: model is a strict union; CLI accepts any string per brief.
          (imageOptions as { model?: string }).model = imageModel;
        }
        if (imageStyle !== undefined) imageOptions.style = imageStyle;

        const cardOptions: CardOptions = {};
        if (dimensions !== undefined) {
          (cardOptions as { dimensions?: string }).dimensions = dimensions;
        }
        if (headerFooter !== undefined) cardOptions.headerFooter = headerFooter;

        const client = makeClient(ctx);

        const request: GenerateRequest = {
          inputText: prompt,
          textMode: textMode as TextMode,
          format,
          numCards,
          ...(opts.theme ? { themeId: opts.theme as string } : {}),
          ...(additionalInstructions ? { additionalInstructions } : {}),
          ...(folderIds.length > 0 ? { folderIds } : {}),
          ...(cardSplit ? { cardSplit } : {}),
          ...(exportAs ? { exportAs } : {}),
          ...(Object.keys(textOptions).length > 0 ? { textOptions } : {}),
          ...(Object.keys(imageOptions).length > 0 ? { imageOptions } : {}),
          ...(Object.keys(cardOptions).length > 0 ? { cardOptions } : {}),
          ...(sharingOptions ? { sharingOptions } : {}),
        };

        const shouldWait = opts.wait as boolean;

        if (!shouldWait) {
          const start = await client.generations.create(request);

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
          request,
          {
            onProgress: (progress) => {
              const elapsed = Math.round((progress.elapsedMs ?? 0) / 1000);
              formatter.printProgress(
                `${progress.status ?? 'generating'}... (${elapsed}s, poll #${progress.pollCount ?? 0})`
              );
            },
            signal: AbortSignal.timeout(timeoutSeconds * 1000),
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
          if (result.pptxUrl) {
            process.stdout.write(`  PPTX:     ${result.pptxUrl}\n`);
          }
          process.stdout.write(`  Credits:  ${result.credits?.deducted ?? 0} used, ${result.credits?.remaining ?? '?'} remaining\n`);
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
    });
}
