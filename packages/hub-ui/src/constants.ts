import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// import.meta.url → .../packages/hub-ui/src/constants.ts
// dirname once → src/, twice → package root.
const here = dirname(fileURLToPath(import.meta.url));

export const hubUiPackageRoot: string = dirname(here);
