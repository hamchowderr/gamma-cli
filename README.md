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

| Command | What it does |
|---|---|
| `gamma generate <prompt>` | Generate a presentation, document, social post, or webpage from a text prompt |
| `gamma generate-from-template <gamma-id> <prompt>` | Generate from an existing gamma used as a template (beta) |
| `gamma status <generation-id>` | Check progress for a previously kicked-off generation |
| `gamma themes list` | List available themes (custom + built-in) |
| `gamma folders list` | List folders you can save generations into |
| `gamma config init` | Interactive setup — write API key to the config file |
| `gamma config show` | Show the resolved config (API key always masked) |

### `gamma generate <prompt>`

Generate a presentation, document, social post, or webpage from a text prompt.

```
Usage: gamma generate [options] [prompt]

Arguments:
  prompt                            Text prompt (use "-" to read from stdin)

Options:
  --from-file <path>                Read prompt from a file
  --type <type>                     Output type: slides, document, social,
                                    webpage (default: "slides")
  --text-mode <mode>                Text handling: generate, condense, preserve
                                    (default: "generate")
  --theme <id>                      Theme UUID
  --folder <id>                     Save to folder UUID (repeatable)
  --language <code>                 Output language code
  --cards <n>                       Number of cards/slides (1-75) (default: "10")
  --additional-instructions <text>  Additional AI instructions
  --text-amount <amount>            Text density: brief, medium, detailed,
                                    extensive
  --tone <text>                     Text tone/voice (<=500 chars)
  --audience <text>                 Target audience description (<=500 chars)
  --image-source <source>           Image source enum (e.g. aiGenerated, pexels,
                                    noImages)
  --image-model <model>             AI image model (when --image-source=aiGenerated)
  --image-style <text>              Artistic style for AI images (<=500 chars)
  --dimensions <value>              Card dimensions (format-dependent)
  --card-split <mode>               Card splitting: auto or inputTextBreaks
  --header-footer <json>            Header/footer config as JSON
  --export-as <format>              Export format: pdf or pptx
  --workspace-access <level>        Workspace access: noAccess, view, comment,
                                    edit, fullAccess
  --external-access <level>         External access: noAccess, view, comment, edit
  --share-email <addr>              Email to share with (repeatable)
  --share-access <level>            Access for --share-email recipients: view,
                                    comment, edit, fullAccess
  --timeout <seconds>               Polling timeout in seconds (default: "600")
  --wait                            Wait for generation to complete (default)
  --no-wait                         Return generation ID immediately without waiting
```

#### Prompt input

The `prompt` argument accepts a literal string. To pass long input use either:

- `--from-file <path>` — read the prompt from a file (the positional `prompt` is then ignored)
- Pass `-` as the prompt and pipe content on stdin: `cat brief.md | gamma generate -`

Prompts must be between 1 and 400,000 characters.

#### Text controls

| Flag | Effect |
|---|---|
| `--text-mode` | `generate` (default) — treat the prompt as an instruction. `condense` — shorten the source text. `preserve` — keep the source text verbatim. |
| `--text-amount` | Density of generated text per card: `brief`, `medium`, `detailed`, `extensive`. |
| `--tone` | Free-text tone/voice direction, up to 500 characters (e.g. `"confident, data-driven"`). |
| `--audience` | Free-text target audience, up to 500 characters (e.g. `"technical founders"`). |

#### Image controls

| Flag | Effect |
|---|---|
| `--image-source` | Image source enum (e.g. `aiGenerated`, `pexels`, `noImages`). |
| `--image-model` | AI image model — only used when `--image-source=aiGenerated`. |
| `--image-style` | Artistic style direction for AI-generated images, up to 500 characters. |

#### Card controls

| Flag | Effect |
|---|---|
| `--cards` | Number of cards/slides, 1–75 (default `10`). |
| `--dimensions` | Card dimensions — values are format-dependent: presentations accept `fluid`, `16x9`, `4x3`; documents accept `fluid`, `pageless`, `letter`, `a4`; social posts accept `1x1`, `4x5`, `9x16`. Rejected when `--type=webpage`. |
| `--card-split` | `auto` (default behavior) or `inputTextBreaks` to honor blank-line breaks in the source. |

#### Export

| Flag | Effect |
|---|---|
| `--export-as` | Also export to `pdf` or `pptx`. The export URL is included in the final output alongside `gammaUrl`. |

#### Sharing

| Flag | Effect |
|---|---|
| `--workspace-access` | Workspace-wide access level: `noAccess`, `view`, `comment`, `edit`, `fullAccess`. |
| `--external-access` | Public/external-link access level: `noAccess`, `view`, `comment`, `edit`. |
| `--share-email` | Email to share the gamma with. Repeatable for multiple recipients. |
| `--share-access` | Access level applied to every `--share-email` recipient: `view`, `comment`, `edit`, `fullAccess`. |

#### Advanced

| Flag | Effect |
|---|---|
| `--header-footer <json>` | Raw JSON object matching the SDK's `HeaderFooterOptions` (e.g. `'{"header":{"text":"Acme"}}'`). Rejected when `--type=webpage`. |
| `--folder <id>` | Save the generation into a folder UUID. Repeatable to file it into multiple folders. |
| `--timeout <seconds>` | Max time to wait when polling for completion (default `600`). Only meaningful when `--wait` is set (which it is by default). |
| `--wait` / `--no-wait` | Block until completion (default) or print the generation ID immediately. |

Example:

```bash
gamma generate "Q4 strategy review for a fintech startup" \
  --type slides \
  --cards 15 \
  --theme 2c3a4b5c-6d7e-8f90-1234-567890abcdef \
  --text-amount detailed \
  --tone "confident, data-driven" \
  --audience "early-stage investors" \
  --image-source aiGenerated \
  --image-style "minimal editorial photography" \
  --dimensions 16x9 \
  --export-as pdf \
  --additional-instructions "Open with a one-slide TL;DR."
```

With `--no-wait`, the command prints the generation ID immediately so you can poll later with `gamma status`.

### `gamma generate-from-template <gamma-id> <prompt>`

Generate a new gamma from an existing gamma used as a template (beta). The template's structure, layout, and theme are reused; only the content is regenerated from the prompt.

```
Usage: gamma generate-from-template [options] <gamma-id> [prompt]

Arguments:
  gamma-id                    Template gamma ID (e.g. g_abcdef123456)
  prompt                      Text prompt (use "-" to read from stdin)

Options:
  --from-file <path>          Read prompt from a file
  --theme <id>                Override the template theme
  --folder <id>               Save to folder UUID (repeatable)
  --export-as <format>        Export format: pdf or pptx
  --image-model <model>       AI image model (only used if template uses AI
                              images)
  --image-style <text>        Artistic style for AI images (<=500 chars)
  --workspace-access <level>  Workspace access: noAccess, view, comment, edit,
                              fullAccess
  --external-access <level>   External access: noAccess, view, comment, edit
  --share-email <addr>        Email to share with (repeatable)
  --share-access <level>      Access for --share-email recipients: view,
                              comment, edit, fullAccess
  --timeout <seconds>         Polling timeout in seconds (default: "600")
  --wait                      Wait for generation to complete (default)
  --no-wait                   Return generation ID immediately without waiting
```

The prompt argument accepts the same `--from-file <path>` and `-` (stdin) inputs as `gamma generate`.

Example:

```bash
gamma generate-from-template g_template123abc \
  "Weekly product update for the engineering team — week of May 19" \
  --folder 11111111-2222-3333-4444-555555555555 \
  --export-as pdf \
  --share-email teamlead@example.com \
  --share-access view
```

### `gamma status <generation-id>`

Check generation progress.

```
Usage: gamma status [options] <generation-id>

Arguments:
  generation-id        Generation ID to check

Options:
  --wait               Poll until complete (default: false)
  --timeout <seconds>  Polling timeout in seconds (only with --wait) (default: "600")
```

Example:

```bash
gamma status gen_abc123
gamma status gen_abc123 --wait
gamma status gen_abc123 --wait --timeout 1200
```

### `gamma themes list`

List available themes (custom + built-in).

```
Usage: gamma themes list [options]

Options:
  --query <text>    Search themes by name
  --limit <n>       Max results (default: "25")
  --all             Fetch every page until exhausted (ignores --limit)
  --cursor <token>  Start from a specific pagination cursor
```

Pass `--all` to auto-paginate every page (useful for piping into `jq`); pass `--cursor <token>` to resume from a known cursor returned by an earlier call.

Example:

```bash
gamma themes list --query dark --limit 10
gamma themes list --all --json | jq 'length'
```

### `gamma folders list`

List folders you can save generations into.

```
Usage: gamma folders list [options]

Options:
  --query <text>    Search folders by name
  --limit <n>       Max results (default: "25")
  --all             Fetch every page until exhausted (ignores --limit)
  --cursor <token>  Start from a specific pagination cursor
```

Example:

```bash
gamma folders list --query "Q4"
gamma folders list --all --json | jq -r '.[].id'
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
gamma generate --from-file brief.md \
  --type document \
  --text-mode preserve \
  --additional-instructions "Keep the original structure and headings."
```

You can also pipe the brief on stdin by passing `-` as the prompt:

```bash
cat brief.md | gamma generate - \
  --type document \
  --text-mode preserve
```

`--text-mode preserve` keeps the source text intact; `condense` shortens it; `generate` (default) treats the prompt as an instruction.

### Generate from an existing template

```bash
gamma generate-from-template g_template123abc \
  "Weekly engineering update — week of May 19" \
  --export-as pdf
```

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
gamma status "$(cat /tmp/gamma-job)" --wait --timeout 1800
```

### Auto-paginate every theme

```bash
gamma themes list --all --json | jq -r '.[] | "\(.id)\t\(.name)"'
```

### Pipe a list of prompts into Gamma

```bash
while read -r prompt; do
  gamma generate "$prompt" --json --quiet | jq -r '.gammaUrl'
done < prompts.txt
```

### Share a generation with reviewers as you create it

```bash
gamma generate "Series A pitch — Acme Robotics" \
  --type slides \
  --cards 14 \
  --share-email reviewer1@example.com \
  --share-email reviewer2@example.com \
  --share-access comment \
  --external-access noAccess
```

---

## Related

- [`@chowderr/gamma-sdk`](https://github.com/hamchowderr/gamma-sdk-typescript) — the TypeScript SDK this CLI wraps
- [Gamma API docs](https://public-api.gamma.app/v1.0) — official API reference
- [Get an API key](https://gamma.app/settings/api)

---

## License

MIT © [chowderr](https://github.com/hamchowderr)
