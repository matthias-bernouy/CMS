# @bernouy/cms-cli

Runtime package for the `p9r` command.

## Responsibilities

- `p9r dev`: run the local editor against `site/`.
- `p9r push` / `p9r pull`: sync system, gateways, files, blocs, templates, and
  pages.
- `p9r files reindex`: reconcile the local media tree and registry.
- `p9r secrets`: work with remote secret keys without exposing values.
- `p9r list-blocs`: inspect remote bloc catalogue.

## Rules

- CLI text is user-facing and must be English.
- Be conservative with filesystem writes. Respect `--dry-run`, `--force`,
  `--yes`, and existing overwrite prompts.
- Never print PAT values, secret values, or credentials.
- Network calls should produce actionable errors that include the command and
  remote URL context, not raw stack traces only.
