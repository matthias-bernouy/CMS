const environment = { ...process.env };

function required(name) {
    const value = String(environment[name] ?? "").trim();
    if (!value) {
        throw new Error(`Missing ${name}`);
    }
    return value;
}

const username = required("MONGO_PROVIDER_USERNAME");
const password = required("MONGO_PROVIDER_PASSWORD");
const admin = db.getSiblingDB("admin");
const existing = admin.getUser(username);
const roles = [{ role: "readWriteAnyDatabase", db: "admin" }];

if (existing) {
    admin.updateUser(username, { pwd: password, roles });
} else {
    admin.createUser({ user: username, pwd: password, roles });
}
