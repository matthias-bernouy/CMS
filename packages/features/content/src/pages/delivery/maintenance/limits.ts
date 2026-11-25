import { DEFAULT_ERROR_PAGES } from "../http/pages/defaultError";
export const MAINTENANCE_LIMITS = { bytes: 4 * 1024 * 1024, resourceBytes: 1024 * 1024, resources: 64 };
export const MAINTENANCE_HTML = DEFAULT_ERROR_PAGES[503];
