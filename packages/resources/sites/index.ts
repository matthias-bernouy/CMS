import { fileURLToPath } from "node:url";

export const OFFICIAL_SITES_ROOT = fileURLToPath(new URL("./", import.meta.url));
export const CMS_REPOSITORY_HUB_ROOT = fileURLToPath(new URL("./cms-repository-hub/", import.meta.url));
export const CMS_REPOSITORY_HUB_SITE_ROOT = fileURLToPath(new URL("./cms-repository-hub/site/", import.meta.url));
