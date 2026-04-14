import type { GammaConfig } from '../config/types.js';
import { Formatter } from '../output/formatter.js';
import { loadConfig, configExists, resolveApiKey } from '../config/config.js';
import { defaultConfig } from '../config/types.js';
import { GammaClient } from '@chowderr/gamma-sdk';

export interface GlobalOptions {
  json: boolean;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  config?: string;
}

export interface CommandContext {
  config: GammaConfig;
  formatter: Formatter;
  globals: GlobalOptions;
}

export async function makeContext(globals: GlobalOptions): Promise<CommandContext> {
  let config: GammaConfig;

  if (globals.config) {
    config = await loadConfig(globals.config);
  } else if (configExists()) {
    config = await loadConfig();
  } else {
    config = defaultConfig();
  }

  const formatter = new Formatter({
    json: globals.json,
    verbose: globals.verbose,
    quiet: globals.quiet,
    noColor: globals.noColor,
  });

  return { config, formatter, globals };
}

export function makeClient(ctx: CommandContext): GammaClient {
  const apiKey = resolveApiKey(ctx.config);
  if (!apiKey) {
    throw new Error(
      'No API key found. Set GAMMA_API_KEY environment variable or run: gamma config init'
    );
  }
  return new GammaClient({ apiKey });
}
