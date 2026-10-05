// The official MongoDB entrypoint creates the root account before running init
// scripts. Keep this check so a reused or manually prepared volume cannot
// silently grant the infrastructure identity a different role.

function requiredEnv(name) {
    const raw = process.env[name];
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error(`${name} must be set`);
    }
    return raw.trim();
}

const rootUsername = requiredEnv("MONGO_INITDB_ROOT_USERNAME");
const adminDb = db.getSiblingDB("admin");
const root = adminDb.getUser(rootUsername);
const roles = root?.roles ?? [];
if (roles.length !== 1 || roles[0].role !== "root" || roles[0].db !== "admin") {
    throw new Error(`${rootUsername} must have only the root@admin role`);
}
print(`Validated MongoDB root user ${rootUsername}`);
