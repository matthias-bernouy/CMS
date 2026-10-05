// Run explicitly for each CMS instance while authenticated as the root user.
// The credential is created in, and can read/write, one site database only.

function requiredEnv(name, expression, description) {
    const value = process.env[name]?.trim();
    if (!value || !expression.test(value)) {
        throw new Error(`${name} must be ${description}`);
    }
    return value;
}

const database = requiredEnv("MONGO_SITE_DATABASE", /^cms_[a-z0-9_-]+$/u, "a cms_<instance> database name");
const username = requiredEnv("MONGO_SITE_USERNAME", /^[A-Za-z0-9_-]+$/u, "a simple username");
const password = requiredEnv("MONGO_SITE_PASSWORD", /^[a-fA-F0-9]{64}$/u, "a 64-character hexadecimal secret");
const siteDb = db.getSiblingDB(database);
const existing = siteDb.getUser(username);

if (existing === null) {
    siteDb.createUser({ user: username, pwd: password, roles: [{ role: "readWrite", db: database }] });
    print(`Created MongoDB user ${username} for ${database}`);
} else {
    const roles = existing.roles ?? [];
    if (roles.length !== 1 || roles[0].role !== "readWrite" || roles[0].db !== database) {
        throw new Error(`${username} must have only the readWrite@${database} role`);
    }
    print(`Validated MongoDB user ${username} for ${database}`);
}
