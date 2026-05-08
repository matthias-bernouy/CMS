import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` resolves to .../packages/hub-api/src/constants.ts.
// Walking up twice gives us the package root, which downstream code uses
// to reference `src/api/...` for `serveApi` without `__dirname` gymnastics
// (cf. .claude/rules/import-rules.md §2).
const here = dirname(fileURLToPath(import.meta.url));

export const hubApiPackageRoot: string = dirname(here);
