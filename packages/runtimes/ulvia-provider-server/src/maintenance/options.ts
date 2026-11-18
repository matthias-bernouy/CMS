import { isAbsolute } from "node:path";

export function contentMaintenanceOptions(args: readonly string[]) {
    const [action, ...rest] = args;
    if (!["status", "upgrade-references", "recover-references"].includes(action ?? "")) {
        throw new Error("Expected status, upgrade-references or recover-references");
    }
    const flags = new Map<string, string>();
    let writersStopped = false;
    for (let index = 0; index < rest.length; index++) {
        const key = rest[index]!;
        if (key === "--writers-stopped" && !writersStopped) {
            writersStopped = true;
            continue;
        }
        if (
            !["--uri-file", "--database", "--prefix", "--site-id", "--expected-token"].includes(key) ||
            flags.has(key)
        ) {
            throw new Error("Unknown or duplicate maintenance option");
        }
        const value = rest[++index];
        if (value === undefined || value.startsWith("--")) {
            throw new Error("A maintenance option value is missing");
        }
        flags.set(key, value);
    }
    const uriFile = flags.get("--uri-file");
    const database = flags.get("--database");
    const prefix = flags.get("--prefix") ?? "";
    const siteId = flags.get("--site-id");
    const expectedToken = flags.get("--expected-token");
    if (
        !uriFile ||
        !isAbsolute(uriFile) ||
        !database ||
        !/^[A-Za-z0-9_-]{1,63}$/.test(database) ||
        !/^[\w.-]{0,120}$/.test(prefix)
    ) {
        throw new Error("An absolute --uri-file, explicit --database and bounded literal --prefix are required");
    }
    if (action !== "status" && !writersStopped) {
        throw new Error("Stop all instance writers and explicitly pass --writers-stopped");
    }
    if (
        action === "recover-references" &&
        (!siteId || siteId.length > 200 || !expectedToken || expectedToken.length > 200)
    ) {
        throw new Error("Recovery requires --site-id and the inspected --expected-token");
    }
    return { action, uriFile, database, prefix, siteId, expectedToken };
}
