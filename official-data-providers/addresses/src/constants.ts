import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Package root (cf. `.claude/rules/import-rules.md` §2). */
export const addressesPackageRoot: string = dirname(here);

/** Upstream BAN API (Base Adresse Nationale, gratuit, sans auth). */
export const BAN_BASE_URL = "https://api-adresse.data.gouv.fr";
