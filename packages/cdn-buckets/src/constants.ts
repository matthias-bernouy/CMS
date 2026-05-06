import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the `@bernouy/cdn-buckets` package root (the directory containing
 * `package.json`). Used at runtime to locate sibling assets (`src/api/`,
 * `src/static/`, `src/components/`) that `serveApi` / `serveStaticFolder`
 * scan via dynamic `import()`. Derived from `import.meta.url` so it survives
 * any installation shape (workspace, file: dep, published).
 */
const here = dirname(fileURLToPath(import.meta.url));
export const cdnPackageRoot = dirname(here); // src/constants.ts → package root
