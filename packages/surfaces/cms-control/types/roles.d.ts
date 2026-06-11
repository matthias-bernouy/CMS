// Roles are manager-defined data (see TSystem.roles), not a closed compile-time
// set, so the control app's role type is just `string`. The privileged `admin`
// super-role and the no-lockout invariants stay enforced at runtime
// (cms-auth core rules) and via the permissions helpers.
export type CMS_ROLES = string;
