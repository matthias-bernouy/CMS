import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` resolves to .../official-tenant-provisioners/_sdk/src/constants.ts.
// Walking up once gives `src/`, twice gives the package root — used to
// reference `src/...` for `serveApi`/test scans without `__dirname`
// gymnastics (cf. .claude/rules/import-rules.md §2).
const here = dirname(fileURLToPath(import.meta.url));

export const sdkPackageRoot: string = dirname(here);

// Wire constants come from the shared contract (single source of truth
// across sign ↔ verify ↔ hub). Re-exported here for the SDK's internal
// import paths; consumers of `@bernouy/tenant-provisioner-sdk` get them through
// `exports/index.ts`.
export {
    TENANT_PROVISIONER_CONTRACT_VERSION,
    LOG_SCHEMA_VERSION,
    EVENT_CATALOG_VERSION,
} from "@bernouy/tenant-provisioner-contract";
