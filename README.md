# @chowderr/gamma-cli

> Terminal client for [Gamma API](https://public-api.gamma.app/v1.0) — create AI-powered presentations, documents, social posts, and webpages from the command line.

[![npm version](https://img.shields.io/npm/v/@chowderr/gamma-cli.svg)](https://www.npmjs.com/package/@chowderr/gamma-cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

Wraps [`@chowderr/gamma-sdk`](https://github.com/hamchowderr/gamma-sdk-typescript) so every Gamma endpoint that has a CLI surface here is backed by a real API call — no stubs.

---

## Install

```bash
npm install -g @chowderr/gamma-cli
```

Or run ad-hoc without installing:

```bash
npx @chowderr/gamma-cli generate "five tips for productivity"
```

Requires Node.js >= 18.

---

## Quick start

1. Get an API key from <https://gamma.app/settings/api>.
2. Save it to your local config:

   ```bash
   gamma config init
   ```

3. Generate something:

   ```bash
   gamma generate "five tips for productivity"
   ```

The CLI polls until generation completes (about 30–90 seconds) and prints the Gamma URL, PDF URL, and credits used.

---

## Authentication

The CLI resolves your API key in this order:

1. `GAMMA_API_KEY` environment variable (highest precedence)
2. `api_key` field in the YAML config file
3. Fail with a clear error message

### Config file location

`gamma config init` writes a YAML file at a platform-appropriate path:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\gamma-cli\config.yaml` |
| macOS | `~/Library/Application Support/gamma-cli/config.yaml` |
| Linux | `$XDG_CONFIG_HOME/gamma-cli/config.yaml` (or `~/.config/gamma-cli/config.yaml`) |

The file is created with mode `0600` (owner read/write only) so the API key is not world-readable.

Override the path per-invocation with `-c <path>` / `--config <path>`.

Example config file:

```yaml
api_key: gamma_sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Commands

### `gamma generate <prompt>`

Generate a presentation, document, social post, or webpage from a text prompt.

```
Usage: gamma generate [options] <prompt>

Arguments:
  prompt                 Text prompt describing what to generate (1-400k chars)

Options:
  --type <type>          Output type: slides, document, social, webpage
                         (default: "slides")
  --text-mode <mode>     Text handling: generate, condense, preserve
                         (default: "generate")
  --theme <id>           Theme UUID
  --folder <id>          Save to folder UUID
  --language <code>      Output language code (e.g. "en", "es", "ja")
  --cards <n>            Number of cards/slides (1-75) (default: "10")
  --instructions <text>  Additional AI instructions
  --wait                 Wait for generation to complete (default)
  --no-wait              Return generation ID immediately without waiting
```

Example:

```bash
gamma generate "Q4 strategy review for a fintech startup" \
  --type slides \
  --cards 15 \
  --theme 2c3a4b5c-6d7e-8f90-1234-567890abcdef \
  --instructions "Use a confident, data-driven tone."
```

With `--no-wait`, the command prints the generation ID immediately so you can poll later with `gamma status`.

### `gamma status <generation-id>`

Check generation progress.

```
Usage: gamma status [options] <generation-id>

Arguments:
  generation-id  Generation ID to check

Options:
  --wait         Poll until complete (default: false)
```

Example:

```bash
gamma status gen_abc123
gamma status gen_abc123 --wait
```

### `gamma themes list`

List available themes (custom + built-in).

```
Usage: gamma themes list [options]

Options:
  --query <text>  Search themes by name
  --limit <n>     Max results (default: "25")
```

Example:

```bash
gamma themes list --query dark --limit 10
```

### `gamma folders list`

List folders you can save generations into.

```
Usage: gamma folders list [options]

Options:
  --query <text>  Search folders by name
  --limit <n>     Max results (default: "25")
```

Example:

```bash
gamma folders list --query "Q4"
```

### `gamma config init`

Interactive setup — prompts for your API key and saves it to the config file (mode `0600`).

```bash
gamma config init
```

### `gamma config show`

Show the resolved config. The API key is masked unless `--json` is passed (and even then only its source is shown, never the raw value).

```bash
gamma config show
gamma config show --json
```

---

## Global options

These work on every command:

| Option | Description |
|---|---|
| `--json` | Emit machine-parseable JSON instead of human text |
| `-v`, `--verbose` | Verbose output (request details, poll counts) |
| `-q`, `--quiet` | Suppress non-essential output |
| `--no-color` | Disable ANSI color codes |
| `-c`, `--config <path>` | Use a specific config file path |
| `-V`, `--version` | Print CLI version |
| `-h`, `--help` | Print help for any command |

---

## JSON output

Pass `--json` to any command to get a stable, machine-parseable shape suitable for piping into `jq`, scripts, or LLM tool-use:

```bash
gamma generate "Intro to vector databases" --json | jq '.gammaUrl'
```

For introspection — for example to teach an LLM the command surface — dump the full Commander schema:

```bash
gamma --help-json
```

This emits a JSON tree of every command, argument, option, and default. It is intended specifically for LLM tool-calling and code generation.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error (validation failure, API error, timeout, missing API key, etc.) |

Errors are written to `stderr`; successful output goes to `stdout`, so you can pipe safely.

---

## Examples

### Generate a deck and save it directly to a folder

```bash
FOLDER_ID=$(gamma folders list --query "Client Decks" --json | jq -r '.[0].id')

gamma generate "Acme Corp onboarding deck" \
  --type slides \
  --cards 12 \
  --folder "$FOLDER_ID"
```

### Generate from a long brief stored in a file

```bash
gamma generate "$(cat brief.md)" \
  --type document \
  --text-mode preserve \
  --instructions "Keep the original structure and headings."
```

`--text-mode preserve` keeps the source text intact; `condense` shortens it; `generate` (default) treats the prompt as an instruction.

### Kick off a long job, poll it from another shell

Shell A:

```bash
GEN_ID=$(gamma generate "Comprehensive guide to event-driven architecture" \
  --cards 50 \
  --no-wait \
  --json | jq -r '.generationId')

echo "$GEN_ID" > /tmp/gamma-job
```

Shell B:

```bash
gamma status "$(cat /tmp/gamma-job)" --wait
```

### Pipe a list of prompts into Gamma

```bash
while read -r prompt; do
  gamma generate "$prompt" --json --quiet | jq -r '.gammaUrl'
done < prompts.txt
```

---

## Related

- [`@chowderr/gamma-sdk`](https://github.com/hamchowderr/gamma-sdk-typescript) — the TypeScript SDK this CLI wraps
- [Gamma API docs](https://public-api.gamma.app/v1.0) — official API reference
- [Get an API key](https://gamma.app/settings/api)

---

## License

MIT © [chowderr](https://github.com/hamchowderr)
