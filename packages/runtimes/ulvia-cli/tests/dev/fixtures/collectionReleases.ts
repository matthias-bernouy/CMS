import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function prepareSmokeCollectionRelease(
    source: string,
    data: string,
    version: string,
    migration = false,
): Promise<string> {
    const target = join(data, `smoke-kit-${version}`, "smoke-kit");
    await cp(source, target, { recursive: true });
    await setJsonFields(join(target, "definition.json"), {
        version,
        ...(migration ? { dataGeneration: 2 } : {}),
    });
    if (migration) {
        await setJsonFields(join(target, "blocs", "smoke-kit-card", "definition.json"), { generation: 2 });
        const migrationDirectory = join(target, "migrations");
        await mkdir(migrationDirectory, { recursive: true });
        await writeFile(
            join(migrationDirectory, "1-to-2.json"),
            JSON.stringify({ fromGeneration: 1, toGeneration: 2, operations: [] }, null, 4) + "\n",
            "utf8",
        );
    }
    return target;
}

async function setJsonFields(path: string, fields: Record<string, unknown>): Promise<void> {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    await writeFile(path, JSON.stringify({ ...value, ...fields }, null, 4) + "\n", "utf8");
}
