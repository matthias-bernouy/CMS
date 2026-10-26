import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function prepareSmokeCollectionRelease(source: string, data: string, version: string): Promise<string> {
    const target = join(data, `smoke-kit-${version}`, "smoke-kit");
    await cp(source, target, { recursive: true });
    await setJsonFields(join(target, "definition.json"), { version });
    return target;
}

async function setJsonFields(path: string, fields: Record<string, unknown>): Promise<void> {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    await writeFile(path, JSON.stringify({ ...value, ...fields }, null, 4) + "\n", "utf8");
}
