#!/usr/bin/env bun
import CLI_push from "./CLI_push";
import CLI_pull from "./CLI_pull";
import CLI_dev from "./CLI_dev";
import CLI_listBlocs from "./CLI_listBlocs";
import CLI_secrets from "./CLI_secrets";
import CLI_filesReindex from "./CLI_filesReindex";

const [command, ...rest] = process.argv.slice(2);

function printHelp() {
    console.log(`p9r — Cms CLI

Usage:
  p9r dev [--port=N --host=H]      Run the editor 100% locally against site/.
                                   No remote calls, no auth. Run \`p9r pull\`
                                   first to bootstrap site/ from a tenant.
  p9r push [flags]                 Push system/integrations/files/blocs/
                                   templates/pages in that order to the remote
                                   CMS.
      --type=<one>|*               One of: system, integrations, files, blocs,
                                   templates, pages (default *).
      --dry-run                    Show what would be uploaded, no writes.
      --yes | -y                   Skip the [y/N] prompt.
      --force | -f                 Bypass conflict + cross-ref validation.
      --only=tag1,tag2             Filter blocs by manifest tag.
  p9r pull [flags]                 Inverse of push: materialize remote into
                                   site/. Same --type set; --yes / --force
                                   to skip the overwrite confirmation.
  p9r list-blocs [--json]          List blocs registered on the remote CMS
                                   (id, name, group, description).
  p9r files reindex [--force]      Scan the media tree, heal files you moved or
                                   renamed in your IDE (by content hash), mint
                                   ids for new files. Commit
                                   .cms-files-registry.json afterward. Run
                                   before pushing; do not run while \`dev\` is up.
  p9r secrets <sub>                Operate on the remote's secret store.
      template [--output=<path>] [--force]
                                   Write an .env.example with the remote's
                                   KEYS only (no values, ever). Default
                                   output: .env.example.
  p9r help                         Show this help

Env (loaded from .env or the environment):
  P9R_URL      Base URL of the remote Cms CMS
               e.g. http://localhost:4999/cms
  P9R_TOKEN    Bearer token for remote commands — a CMS Personal Access Token
               (pat_...) created in the admin Profile page. Alternatively store
               it in ~/.config/p9r/credentials.json keyed by CMS URL.
`);
}

try {
    switch (command) {
        case "login":
        case "logout":
            console.error("✖ `p9r login`/`logout` were removed. Create a Personal Access Token in the CMS admin Profile page, then set P9R_TOKEN=pat_... (or add it to ~/.config/p9r/credentials.json).");
            process.exit(1);
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
        case "files":
            await CLI_filesReindex(rest);
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
