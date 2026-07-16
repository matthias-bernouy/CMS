// The official MongoDB entrypoint runs this file only for a fresh data volume,
// after creating the root user. It can also be run manually against the legacy
// unauthenticated container before enabling authentication on an existing
// volume; in that case it creates both users.

function requiredEnv(name) {
    const raw = process.env[name];
    if (typeof raw !== "string") throw new Error(`${name} must be set`);
    const value = raw.trim();
    if (!value) throw new Error(`${name} must be set`);
    return value;
}

function requiredUsername(name) {
    const value = requiredEnv(name);
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error(`${name} must contain only letters, numbers, underscores, or hyphens`);
    }
    return value;
}

function requiredHexSecret(name) {
    const value = requiredEnv(name);
    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
        throw new Error(`${name} must be a 64-character hexadecimal secret`);
    }
    return value;
}

function assertOnlyRole(user, username, expectedRole) {
    const roles = user.roles ?? [];
    if (
        roles.length !== 1
        || roles[0].role !== expectedRole
        || roles[0].db !== "admin"
    ) {
        throw new Error(`${username} must have only the ${expectedRole}@admin role`);
    }
}

const rootUsername = requiredUsername("MONGO_INITDB_ROOT_USERNAME");
const rootPassword = requiredHexSecret("MONGO_INITDB_ROOT_PASSWORD");
const appUsername = requiredUsername("MONGO_APP_USERNAME");
const appPassword = requiredHexSecret("MONGO_APP_PASSWORD");

if (appUsername === rootUsername) {
    throw new Error("MONGO_APP_USERNAME must differ from MONGO_INITDB_ROOT_USERNAME");
}

const adminDb = db.getSiblingDB("admin");

const existingRoot = adminDb.getUser(rootUsername);
if (existingRoot === null) {
    adminDb.createUser({
        user: rootUsername,
        pwd: rootPassword,
        roles: [{ role: "root", db: "admin" }],
    });
    print(`Initialized MongoDB root user ${rootUsername}`);
} else {
    assertOnlyRole(existingRoot, rootUsername, "root");
}

const existingApp = adminDb.getUser(appUsername);
if (existingApp === null) {
    adminDb.createUser({
        user: appUsername,
        pwd: appPassword,
        roles: [{ role: "readWriteAnyDatabase", db: "admin" }],
    });
    print(`Initialized shared CMS MongoDB application user ${appUsername}`);
} else {
    assertOnlyRole(existingApp, appUsername, "readWriteAnyDatabase");
}
