import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonArray(path: string): Promise<unknown[]> {
    if (!existsSync(path)) {
        return [];
    }
    const parsed = JSON.parse(await readFile(path, "utf-8")) as unknown;
    return Array.isArray(parsed) ? parsed : [];
}

export async function writeJsonArray(path: string, values: unknown[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(values, null, 4)}\n`, "utf-8");
}
