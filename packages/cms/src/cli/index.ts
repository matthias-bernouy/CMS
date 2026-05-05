#!/usr/bin/env bun
import CLI_importBloc from "./CLI_importBloc";
import CLI_dev from "./CLI_dev";
import CLI_init from "./CLI_init";
import CLI_new from "./CLI_new";
import CLI_installSkill from "./CLI_installSkill";
import CLI_listBlocs from "./CLI_listBlocs";

const [command, ...rest] = process.argv.slice(2);

function printHelp() {
    console.log(`p9r — Cms CLI

Usage:
  p9r init <folder> [--force]      Scaffold a new bloc in <folder> from the
                                   base template (manifest.json, Bloc.ts,
                                   BlocEditor.ts, template.html, style.css,
                                   configuration.html, assets/)
  p9r new <folder> [flags]         Scaffold a new CMS app (Control + Delivery
                                   co-hosted, in-memory providers, basic auth)
                                   into <folder>
      --template=full              Template to use (default: full)
      --force | -f                 Allow a non-empty target folder
  p9r install-skill [--force]      Install the bloc-creator Claude Code skill
                                   into ./.claude/skills/ so Claude can scaffold
                                   blocs on request in this project
  p9r dev                          Run the local editor against a remote CMS
  p9r import [flags]               Scan the current folder and push new blocs
                                   to the remote CMS via its admin API
      --dry-run                    Scan, build, and show what would be pushed
      --only=tag1,tag2             Only consider the listed manifest tags
  p9r list-blocs [--json]          List blocs registered on the remote CMS
                                   (id, name, group, description) so agents
                                   know what tags already exist
  p9r help                         Show this help

Behaviour of 'p9r import':
  • Scans the cwd for folders containing a manifest.json
  • Builds each bloc (view + editor; opaque wrapper if no editor file)
  • Fetches the remote bloc list and skips any tag that already exists
  • Uploads new blocs via multipart POST to {P9R_URL}/api/bloc
  • Existing blocs are never overwritten — delete them from the admin UI first

Env (loaded from .env or the environment):
  P9R_URL      Base URL of the remote Cms CMS
               e.g. http://localhost:4999/cms
  P9R_TOKEN    Bearer token used to authenticate as an admin
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
        case "dev":
            await CLI_dev(rest);
            break;
        case "import":
            await CLI_importBloc(rest);
            console.log("Done.");
            break;
        case "list-blocs":
            await CLI_listBlocs(rest);
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
