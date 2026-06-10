/**
 * Legacy fixed role union, predating manager-defined roles (TSystem.roles).
 * Still typed through the admin chain while enforcement lands; duplicates
 * cms-auth's generic `DefaultRole` on purpose — reconciling the two is the
 * roles project's call, not this package's.
 */
export type CMS_ROLES = "admin" | "user";
