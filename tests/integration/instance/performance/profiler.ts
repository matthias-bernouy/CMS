import { docker } from "../docker";
export async function mongoProfile(stackId: string, action: "start" | "read") {
    const script =
        action === "start"
            ? `
        const databases = db.adminCommand({listDatabases:1}).databases.map(item => item.name).filter(name => !["admin", "config", "local"].includes(name));
        for (const name of databases) { const target = db.getSiblingDB(name); target.setProfilingLevel(0); target.system.profile.drop(); target.setProfilingLevel(2); }
        print(JSON.stringify({ databases: databases.length }));
    `
            : `
        const rows = [];
        for (const info of db.adminCommand({listDatabases:1}).databases.filter(item => !["admin", "config", "local"].includes(item.name))) {
            const target = db.getSiblingDB(info.name); target.setProfilingLevel(0);
            for (const row of target.system.profile.find({ op: { $in: ["query", "command", "getmore", "insert", "update", "remove"] } }).toArray()) {
                rows.push({ op: row.op, ns: row.ns, command: Object.keys(row.command ?? {}).find(key => ["find", "aggregate", "getMore", "insert", "update", "delete", "findAndModify"].includes(key)) });
            }
        }
        const operations = rows.filter(row => row.op !== "command" || row.command);
        const byCollection = {};
        for (const row of operations) { const key = String(row.ns).split(".").slice(1).join("."); byCollection[key] = (byCollection[key] ?? 0) + 1; }
        print(JSON.stringify({ operations: operations.length, byCollection }));
    `;
    const result = await docker(["exec", `${stackId}-mongo`, "mongosh", "--quiet", "--eval", script]);
    return JSON.parse(result.stdout.trim()) as {
        operations?: number;
        databases?: number;
        byCollection?: Record<string, number>;
    };
}
export async function internalRequests(providerName: string, edgeName: string, reset = false) {
    let count = 0;
    for (const name of [providerName, edgeName]) {
        const result = await docker([
            "exec",
            name,
            "bun",
            "-e",
            reset
                ? 'await Bun.write("/tmp/ulvia-performance-fetch.ndjson", "")'
                : 'console.log((await Bun.file("/tmp/ulvia-performance-fetch.ndjson").text()).trim().split("\\n").filter(Boolean).length)',
        ]);
        if (!reset) {
            count += Number(result.stdout.trim());
        }
    }
    return count;
}

export async function internalRequestPaths(providerName: string, edgeName: string) {
    const paths: Record<string, number> = {};
    for (const name of [providerName, edgeName]) {
        const result = await docker([
            "exec",
            name,
            "bun",
            "-e",
            'console.log(JSON.stringify((await Bun.file("/tmp/ulvia-performance-fetch.ndjson").text()).trim().split("\\n").filter(Boolean)))',
        ]);
        for (const path of JSON.parse(result.stdout.trim()) as string[]) {
            paths[path] = (paths[path] ?? 0) + 1;
        }
    }
    return paths;
}
