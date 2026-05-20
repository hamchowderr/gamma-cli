import { readFileSync } from 'node:fs';
import type {
  CardSplit,
  ExportFormat,
  ExternalAccess,
  Format,
  HeaderFooterOptions,
  ImageSource,
  SharingOptions,
  TextAmount,
  WorkspaceAccess,
} from '@chowderr/gamma-sdk';

const TEXT_AMOUNTS: readonly TextAmount[] = ['brief', 'medium', 'detailed', 'extensive'] as const;

const IMAGE_SOURCES: readonly ImageSource[] = [
  'aiGenerated',
  'pictographic',
  'pexels',
  'unsplash',
  'giphy',
  'webAllImages',
  'webFreeToUse',
  'webFreeToUseCommercially',
  'placeholder',
  'noImages',
] as const;

const CARD_SPLITS: readonly CardSplit[] = ['auto', 'inputTextBreaks'] as const;

const EXPORT_FORMATS: readonly ExportFormat[] = ['pdf', 'pptx'] as const;

const WORKSPACE_ACCESS: readonly WorkspaceAccess[] = [
  'noAccess',
  'view',
  'comment',
  'edit',
  'fullAccess',
] as const;

const EXTERNAL_ACCESS: readonly ExternalAccess[] = ['noAccess', 'view', 'comment', 'edit'] as const;

const SHARE_ACCESS = ['view', 'comment', 'edit', 'fullAccess'] as const;
export type ShareAccess = (typeof SHARE_ACCESS)[number];

const DIMENSIONS_BY_FORMAT: Record<Exclude<Format, 'webpage'>, readonly string[]> = {
  presentation: ['fluid', '16x9', '4x3'],
  document: ['fluid', 'pageless', 'letter', 'a4'],
  social: ['1x1', '4x5', '9x16'],
};

export function collect(value: string, acc: string[]): string[] {
  return acc.concat([value]);
}

/**
 * Resolve the prompt for a generate command, supporting:
 *  - prompt arg (literal text)
 *  - prompt arg of '-' (read stdin)
 *  - --from-file <path> (read file)
 *
 * Throws an Error with a user-friendly message on conflict / IO failure.
 */
export async function resolvePromptInput(
  promptArg: string | undefined,
  fromFile: string | undefined
): Promise<string> {
  const hasArg = typeof promptArg === 'string' && promptArg.length > 0;
  const hasFile = typeof fromFile === 'string' && fromFile.length > 0;
  const isStdin = promptArg === '-';

  if (hasFile && hasArg && !isStdin) {
    throw new Error('Cannot use both <prompt> argument and --from-file. Pick one.');
  }

  if (hasFile) {
    try {
      return readFileSync(fromFile, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read --from-file "${fromFile}": ${message}`);
    }
  }

  if (isStdin) {
    return await readStdin();
  }

  if (!hasArg) {
    throw new Error('Missing prompt. Provide a prompt argument, "-" for stdin, or --from-file <path>.');
  }

  return promptArg!;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', (err) => reject(err));
  });
}

export function validateTextAmount(value: string | undefined): TextAmount | undefined {
  if (value === undefined) return undefined;
  if (!TEXT_AMOUNTS.includes(value as TextAmount)) {
    throw new Error(
      `Invalid --text-amount "${value}". Must be one of: ${TEXT_AMOUNTS.join(', ')}`
    );
  }
  return value as TextAmount;
}

export function validateBoundedString(
  value: string | undefined,
  flag: string,
  max = 500
): string | undefined {
  if (value === undefined) return undefined;
  if (value.length < 1 || value.length > max) {
    throw new Error(`${flag} must be between 1 and ${max} characters`);
  }
  return value;
}

export function validateImageSource(value: string | undefined): ImageSource | undefined {
  if (value === undefined) return undefined;
  if (!IMAGE_SOURCES.includes(value as ImageSource)) {
    throw new Error(
      `Invalid --image-source "${value}". Must be one of: ${IMAGE_SOURCES.join(', ')}`
    );
  }
  return value as ImageSource;
}

export function validateCardSplit(value: string | undefined): CardSplit | undefined {
  if (value === undefined) return undefined;
  if (!CARD_SPLITS.includes(value as CardSplit)) {
    throw new Error(`Invalid --card-split "${value}". Must be one of: ${CARD_SPLITS.join(', ')}`);
  }
  return value as CardSplit;
}

export function validateExportFormat(value: string | undefined): ExportFormat | undefined {
  if (value === undefined) return undefined;
  if (!EXPORT_FORMATS.includes(value as ExportFormat)) {
    throw new Error(
      `Invalid --export-as "${value}". Must be one of: ${EXPORT_FORMATS.join(', ')}`
    );
  }
  return value as ExportFormat;
}

export function validateWorkspaceAccess(value: string | undefined): WorkspaceAccess | undefined {
  if (value === undefined) return undefined;
  if (!WORKSPACE_ACCESS.includes(value as WorkspaceAccess)) {
    throw new Error(
      `Invalid --workspace-access "${value}". Must be one of: ${WORKSPACE_ACCESS.join(', ')}`
    );
  }
  return value as WorkspaceAccess;
}

export function validateExternalAccess(value: string | undefined): ExternalAccess | undefined {
  if (value === undefined) return undefined;
  if (!EXTERNAL_ACCESS.includes(value as ExternalAccess)) {
    throw new Error(
      `Invalid --external-access "${value}". Must be one of: ${EXTERNAL_ACCESS.join(', ')}`
    );
  }
  return value as ExternalAccess;
}

export function validateShareAccess(value: string | undefined): ShareAccess | undefined {
  if (value === undefined) return undefined;
  if (!SHARE_ACCESS.includes(value as ShareAccess)) {
    throw new Error(
      `Invalid --share-access "${value}". Must be one of: ${SHARE_ACCESS.join(', ')}`
    );
  }
  return value as ShareAccess;
}

export function validateDimensions(
  value: string | undefined,
  format: Format
): string | undefined {
  if (value === undefined) return undefined;
  if (format === 'webpage') {
    throw new Error('--dimensions is not supported when --type=webpage');
  }
  const valid = DIMENSIONS_BY_FORMAT[format];
  if (!valid.includes(value)) {
    throw new Error(
      `Invalid --dimensions "${value}" for --type=${formatToType(format)}. Must be one of: ${valid.join(', ')}`
    );
  }
  return value;
}

function formatToType(format: Format): string {
  switch (format) {
    case 'presentation':
      return 'slides';
    case 'document':
      return 'document';
    case 'social':
      return 'social';
    case 'webpage':
      return 'webpage';
  }
}

export function parseTimeoutSeconds(value: string | undefined, defaultSeconds: number): number {
  if (value === undefined) return defaultSeconds;
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) {
    throw new Error('--timeout must be a positive number of seconds');
  }
  return n;
}

export function parseHeaderFooter(
  value: string | undefined,
  format: Format
): HeaderFooterOptions | undefined {
  if (value === undefined) return undefined;
  if (format === 'webpage') {
    throw new Error('--header-footer is not supported when --type=webpage');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`--header-footer must be valid JSON: ${message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--header-footer must be a JSON object');
  }
  return parsed as HeaderFooterOptions;
}

export interface SharingOptionInputs {
  workspaceAccess?: WorkspaceAccess;
  externalAccess?: ExternalAccess;
  shareEmails?: string[];
  shareAccess?: ShareAccess;
}

export function buildSharingOptions(inputs: SharingOptionInputs): SharingOptions | undefined {
  const { workspaceAccess, externalAccess, shareEmails, shareAccess } = inputs;
  const hasEmails = Array.isArray(shareEmails) && shareEmails.length > 0;

  if (!workspaceAccess && !externalAccess && !hasEmails && !shareAccess) {
    return undefined;
  }

  const sharing: SharingOptions = {};
  if (workspaceAccess) sharing.workspaceAccess = workspaceAccess;
  if (externalAccess) sharing.externalAccess = externalAccess;
  if (hasEmails) {
    sharing.emailOptions = {
      recipients: shareEmails!,
      ...(shareAccess ? { access: shareAccess } : {}),
    };
  }
  return sharing;
}
