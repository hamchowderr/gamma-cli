import type { Command } from 'commander';

interface CommandSchema {
  name: string;
  description: string;
  options: OptionSchema[];
  subcommands?: CommandSchema[];
}

interface OptionSchema {
  flags: string;
  description: string;
  default?: unknown;
}

function commandToSchema(cmd: Command): CommandSchema {
  const schema: CommandSchema = {
    name: cmd.name(),
    description: cmd.description(),
    options: cmd.options.map((opt) => ({
      flags: opt.flags,
      description: opt.description,
      ...(opt.defaultValue !== undefined ? { default: opt.defaultValue } : {}),
    })),
  };

  const subs = cmd.commands;
  if (subs.length > 0) {
    schema.subcommands = subs.map(commandToSchema);
  }

  return schema;
}

export function printHelpJSON(program: Command): void {
  const schema = commandToSchema(program);
  process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
}
