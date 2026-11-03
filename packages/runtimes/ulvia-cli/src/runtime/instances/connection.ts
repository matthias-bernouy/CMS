import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA = "ulvia.local-instance.v1" as const;

export type LocalInstanceConnection = Readonly<{
    schema: typeof SCHEMA;
    instanceId: string;
    token: string;
}>;

export async function saveLocalInstanceConnection(
    instanceRoot: string,
    value: Omit<LocalInstanceConnection, "schema">,
) {
    const connection: LocalInstanceConnection = { schema: SCHEMA, ...value };
    const path = join(instanceRoot, "instance.json");
    await writeFile(path, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
    return connection;
}

export async function loadLocalInstanceConnection(instanceRoot: string): Promise<LocalInstanceConnection | null> {
    const path = join(instanceRoot, "instance.json");
    const source = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return null;
    }
    await chmod(path, 0o600);
    const value = JSON.parse(source) as Partial<LocalInstanceConnection>;
    if (
        value.schema !== SCHEMA ||
        !/^instance:[0-9a-f-]{36}$/u.test(value.instanceId ?? "") ||
        !/^[A-Za-z0-9_-]{43}$/u.test(value.token ?? "")
    ) {
        throw new Error("Ulvia local instance connection is invalid");
    }
    return value as LocalInstanceConnection;
}
