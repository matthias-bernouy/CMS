import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ManifestEntry = { file: string } | { manifest: string };

export async function createSqlRoot(): Promise<string> {
    return await mkdtemp(join(tmpdir(), "cms-integrations-sql-bundle-"));
}

export async function writeSql(root: string, path: string, sql: string): Promise<void> {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, sql);
}

export async function writeManifest(root: string, path: string, entries: ManifestEntry[]): Promise<void> {
    await writeJson(root, path, {
        schema: "cms.integration.sql-bundle.v1",
        transaction: "atomic",
        entries,
    });
}

export async function writeJson(root: string, path: string, value: unknown): Promise<void> {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value)}\n`);
}
