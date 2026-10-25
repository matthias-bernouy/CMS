import { basename } from "node:path";
import { scanJsonSourceTree } from "./sourceTree";

/** Load cumulative adjacent data migrations from an arbitrarily nested source tree. */
export async function loadCollectionMigrations(directory: string): Promise<unknown[]> {
    const migrations = [];
    const files = await scanJsonSourceTree(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    for (const file of files) {
        const value = (await Bun.file(file.absolutePath).json()) as Record<string, unknown>;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Migration file ${file.relativePath} must contain one JSON object`);
        }
        const expectedName = `${value.fromGeneration}-to-${value.toGeneration}`;
        if (basename(file.relativePath, ".json") !== expectedName) {
            throw new Error(`Migration file ${file.relativePath} must be named ${expectedName}.json`);
        }
        migrations.push(value);
    }
    return migrations;
}
