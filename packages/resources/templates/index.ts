import { fileURLToPath } from "node:url";

export const SITE_TEMPLATES_ROOT = fileURLToPath(new URL("./", import.meta.url));
export const DEFAULT_SITE_TEMPLATE_ROOT = fileURLToPath(new URL("./default-site/", import.meta.url));
export const DEFAULT_SITE_TEMPLATE_SITE_ROOT = fileURLToPath(new URL("./default-site/site/", import.meta.url));
export const SITE_PHOTO_TEMPLATE_ROOT = fileURLToPath(new URL("./site-photo/", import.meta.url));
export const SITE_PHOTO_TEMPLATE_SITE_ROOT = fileURLToPath(new URL("./site-photo/site/", import.meta.url));
