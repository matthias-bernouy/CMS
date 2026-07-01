import { fileURLToPath } from "node:url";

export const OFFICIAL_INTEGRATIONS_ROOT = fileURLToPath(new URL("./integrations/", import.meta.url));
