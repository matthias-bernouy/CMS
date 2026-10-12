const environment = { ...process.env };

function requiredEnv(name, expression, description) {
    const raw = environment[name];
    const value = typeof raw === "string" ? String(raw).trim() : "";
    if (!value || !expression.test(value)) {
        throw new Error(`${name} must be ${description}`);
    }
    return value;
}

const username = requiredEnv("MONGO_PROVIDER_USERNAME", /^[A-Za-z0-9_-]+$/u, "a simple username");
const password = requiredEnv("MONGO_PROVIDER_PASSWORD", /^[a-fA-F0-9]{64}$/u, "a 64-character hexadecimal secret");
const admin = db.getSiblingDB("admin");
const existing = admin.getUser(username);

if (existing === null) {
    admin.createUser({ user: username, pwd: password, roles: [{ role: "readWriteAnyDatabase", db: "admin" }] });
} else {
    const roles = existing.roles ?? [];
    if (roles.length !== 1 || roles[0].role !== "readWriteAnyDatabase" || roles[0].db !== "admin") {
        throw new Error(`${username} must have only the readWriteAnyDatabase@admin role`);
    }
}
