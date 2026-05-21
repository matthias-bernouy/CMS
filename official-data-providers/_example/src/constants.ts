import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// import.meta.url -> .../official-data-providers/_example/src/constants.ts
// dirname once -> src/, twice -> package root (cf. .claude/rules/import-rules.md §2).
const here = dirname(fileURLToPath(import.meta.url));

export const examplePackageRoot: string = dirname(here);
