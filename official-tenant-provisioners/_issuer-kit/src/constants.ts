import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` → .../official-tenant-provisioners/_issuer-kit/src/constants.ts.
// Twice up = package root (cf. import-rules.md §2; same pattern as _sdk).
const here = dirname(fileURLToPath(import.meta.url));

export const issuerKitPackageRoot: string = dirname(here);

// Wire-contract constants come from the shared single-source package
// (`@bernouy/tenant-provisioner-contract`) — the kit MUST NOT redeclare them.
export {
    TENANT_PROVISIONER_CONTRACT_VERSION, CRYPTO_DEFAULTS, metadocPath,
} from "@bernouy/tenant-provisioner-contract";
