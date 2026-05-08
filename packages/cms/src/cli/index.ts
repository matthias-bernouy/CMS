#!/usr/bin/env bun
import CLI_push from "./CLI_push";
import CLI_pull from "./CLI_pull";
import CLI_dev from "./CLI_dev";
import CLI_init from "./CLI_init";
import CLI_new from "./CLI_new";
import CLI_installSkill from "./CLI_installSkill";
import CLI_listBlocs from "./CLI_listBlocs";
import CLI_login, { CLI_logout } from "./CLI_login";
import CLI_secrets from "./CLI_secrets";

const [command, ...rest] = process.argv.slice(2);

function printHelp() {
    console.log(`p9r — Cms CLI

Usage:
  p9r init <folder> [--force]      Scaffold a new bloc folder.
  p9r new <folder> [flags]         Scaffold a CMS app (Control + Delivery,
                                   in-memory providers, basic auth).
      --template=full              Template (default: full)
      --force | -f                 Allow a non-empty target.
  p9r install-skill [--force]      Install the bloc-creator Claude skill
                                   into ./.claude/skills/.
  p9r login  [--url=...]           Keycloak Device Auth flow (cached in
                                   ~/.config/p9r/credentials.json).
  p9r logout [--url=...]           Drop stored credentials for the URL.
  p9r dev [--port=N --host=H]      Run the editor 100% locally against site/.
                                   No remote calls, no auth. Run \`p9r pull\`
                                   first to bootstrap site/ from a tenant.
  p9r push [flags]                 Push system/blocs/site/{snippets,templates,
                                   pages} in that order to the remote CMS.
      --type=<one>|*               One of: system, blocs, snippets, templates,
                                   pages (default *: full pipeline).
      --dry-run                    Show what would be uploaded, no writes.
      --yes | -y                   Skip the [y/N] prompt.
      --force | -f                 Bypass conflict + cross-ref validation.
      --only=tag1,tag2             Filter blocs by manifest tag.
  p9r pull [flags]                 Inverse of push: materialize remote into
                                   site/. Same --type set; --yes / --force
                                   to skip the overwrite confirmation.
  p9r list-blocs [--json]          List blocs registered on the remote CMS
                                   (id, name, group, description).
  p9r secrets <sub>                Operate on the remote's secret store.
      template [--output=<path>] [--force]
                                   Write an .env.example with the remote's
                                   KEYS only (no values, ever). Default
                                   output: .env.example.
  p9r help                         Show this help

Env (loaded from .env or the environment):
  P9R_URL      Base URL of the remote Cms CMS
               e.g. http://localhost:4999/cms
  P9R_TOKEN    Optional fallback bearer token (legacy static-token mode).
               Prefer \`p9r login\` for the Keycloak device flow.
`);
}

try {
    switch (command) {
        case "init":
            await CLI_init(rest);
            break;
        case "new":
            await CLI_new(rest);
            break;
        case "install-skill":
            await CLI_installSkill(rest);
            break;
        case "login":
            await CLI_login(rest);
            break;
        case "logout":
            await CLI_logout(rest);
            break;
        case "dev":
            await CLI_dev(rest);
            break;
        case "push":
            await CLI_push(rest);
            break;
        case "pull":
            await CLI_pull(rest);
            break;
        case "import":
            console.error("✖ `p9r import` has been removed — use `p9r push --type=blocs` (or just `p9r push` for blocs + pages).");
            process.exit(1);
            break;
        case "list-blocs":
            await CLI_listBlocs(rest);
            break;
        case "secrets":
            await CLI_secrets(rest);
            break;
        case undefined:
        case "help":
        case "--help":
        case "-h":
            printHelp();
            break;
        default:
            console.error(`Unknown command: ${command}\n`);
            printHelp();
            process.exit(1);
    }
} catch (e) {
    console.error("Global Error:", e);
    process.exit(1);
}
