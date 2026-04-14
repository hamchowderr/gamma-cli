import type { Command } from 'commander';
import type { GlobalOptions } from '../context.js';
import { makeContext } from '../context.js';
import { loadConfig, saveConfig, configPath, configExists, resolveApiKey } from '../../config/config.js';
import { defaultConfig } from '../../config/types.js';
import { password, confirm } from '@inquirer/prompts';

function maskKey(key: string): string {
  if (key.length <= 10) return key;
  return key.slice(0, 10) + '...';
}

export function registerConfigCommands(
  program: Command,
  getGlobals: (prog: Command) => GlobalOptions
): void {
  const config = program.command('config').description('Manage configuration');

  config
    .command('init')
    .description('Interactive setup — prompt for API key, save to config')
    .action(async (_opts, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);

      try {
        if (configExists()) {
          const overwrite = await confirm({
            message: 'Config already exists. Overwrite?',
          });
          if (!overwrite) {
            ctx.formatter.printWarning('Aborted.');
            return;
          }
        }

        const apiKey = await password({
          message: 'Enter your Gamma API key (sk-gamma-...):',
        });

        if (!apiKey || apiKey.trim().length === 0) {
          ctx.formatter.printError('API key cannot be empty.');
          process.exitCode = 1;
          return;
        }

        const cfg = defaultConfig();
        cfg.api_key = apiKey.trim();

        await saveConfig(cfg);
        ctx.formatter.printSuccess(`Config saved to ${configPath()}`);
      } catch (err) {
        ctx.formatter.printError(err instanceof Error ? err : String(err));
        process.exitCode = 1;
      }
    });

  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd: Command) => {
      let root = cmd;
      while (root.parent) root = root.parent;
      const globals = getGlobals(root);
      const ctx = await makeContext(globals);

      try {
        const cfg = await loadConfig();
        const envKey = process.env['GAMMA_API_KEY'];
        const resolvedKey = resolveApiKey(cfg);
        const source = envKey ? 'environment variable (GAMMA_API_KEY)' : 'config file';
        const masked = resolvedKey ? maskKey(resolvedKey) : '(not set)';

        if (opts.json || ctx.globals.json) {
          ctx.formatter.printJSON({
            api_key: masked,
            api_key_source: source,
            config_file: configPath(),
            defaults: cfg.defaults,
          });
          return;
        }

        const lines = [
          `API Key:    ${masked}`,
          `Source:     ${source}`,
          `Config:     ${configPath()}`,
          '',
          'Defaults:',
          `  format:     ${cfg.defaults.format}`,
          `  text_mode:  ${cfg.defaults.text_mode}`,
          `  num_cards:  ${cfg.defaults.num_cards}`,
          `  limit:      ${cfg.defaults.limit}`,
        ];

        process.stdout.write(lines.join('\n') + '\n');
      } catch (err) {
        ctx.formatter.printError(err instanceof Error ? err : String(err));
        process.exitCode = 1;
      }
    });
}
