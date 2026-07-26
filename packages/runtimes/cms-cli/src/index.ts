#!/usr/bin/env bun
import CLI_push from "./commands/CLI_push";
import CLI_pull from "./commands/CLI_pull";
import CLI_secrets from "./commands/CLI_secrets";
import CLI_filesReindex from "./commands/CLI_filesReindex";

const [command, ...rest] = process.argv.slice(2);

function printHelp() {
    console.log(`p9r — Cms CLI

Usage:
  p9r dev [--port=N --host=H --no-workers --no-source-images]
                                    Run the editor locally; scheduled triggers start by default.
                                   Responsive Source images are enabled by default.
                                   No remote calls, no auth. Run \`p9r pull\`
                                   first to bootstrap site/ from a tenant.
  p9r preview [--port=N --host=H --no-workers --no-source-images]
                                   Run the same local CMS with production
                                   caching, minification, and security headers.
                                   Uses local adapters and development auth;
                                   never expose it as a production deployment.
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
  p9r files reindex [--force]      Scan the media tree, heal files you moved or
                                   renamed in your IDE (by content hash), mint
                                   ids for new files. Commit
                                   .cms-files-registry.json afterward. Run
                                   before pushing; do not run while \`dev\` or
                                   \`preview\` is up.
  p9r secrets <sub>                Operate on the remote's secret store.
      template [--output=<path>] [--force]
                                   Write an .env.example with the remote's
                                   KEYS only (no values, ever). Default
                                   output: .env.example.
  p9r repository publish-official [--dry-run]
                                   Deterministically build and publish every
                                   official integration package. Publishing
                                   requires --url and --token-file (or their
                                   repository-management env equivalents).
  p9r repository import-official-schema-baselines [--dry-run]
                                   Import reviewed legacy SQL baselines through
                                   the separate maintenance capability.
  p9r repository backfill-official-verification [--dry-run]
                                   Attach legacy verification evidence to exact
                                   packages through the maintenance capability.
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
        case "dev":
            process.env.MODE = "DEV";
            await (await import("./commands/CLI_dev")).default(rest);
            break;
        case "preview":
            process.env.MODE = "PROD";
            await (await import("./commands/CLI_preview")).default(rest);
            break;
        case "push":
            await CLI_push(rest);
            break;
        case "pull":
            await CLI_pull(rest);
            break;
        case "secrets":
            await CLI_secrets(rest);
            break;
        case "files":
            await CLI_filesReindex(rest);
            break;
        case "repository":
            process.exitCode =
                rest[0] === "import-official-schema-baselines"
                    ? await (
                          await import("./repositoryPublication/baselineImportCommand")
                      ).runRepositoryBaselineImportCommand(rest)
                    : rest[0] === "backfill-official-verification"
                      ? await (
                            await import("./repositoryPublication/maintenance/backfillCommand")
                        ).runRepositoryVerificationBackfillCommand(rest)
                      : await (await import("./repositoryPublication/command")).runRepositoryPublicationCommand(rest);
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
