import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` → .../official-data-providers/_issuer-kit/src/constants.ts.
// Twice up = package root (cf. import-rules.md §2; same pattern as _sdk).
const here = dirname(fileURLToPath(import.meta.url));

export const issuerKitPackageRoot: string = dirname(here);

// Wire-contract constants come from the shared single-source package
// (`@bernouy/data-provider-contract`) — the kit MUST NOT redeclare them.
export {
    DATA_PROVIDER_CONTRACT_VERSION, CRYPTO_DEFAULTS, metadocPath,
} from "@bernouy/data-provider-contract";
