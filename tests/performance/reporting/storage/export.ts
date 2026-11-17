import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRun } from "../history";
import { regularBytes, realDirectory } from "./io";

/** Portable artifact directories can be retained by any CI artifact store or ordinary file archive. */
export async function exportRun(source: string, id: string, destination: string): Promise<string> {
    await readRun(source, id);
    await mkdir(destination, { recursive: true, mode: 0o700 });
    await realDirectory(destination);
    const target = join(destination, id);
    await mkdir(target, { mode: 0o700 });
    const path = join(source, id);
    const seal = JSON.parse((await regularBytes(join(path, "complete.json"), 4096)).toString());
    const names = [
        "results.json",
        "report.html",
        ...(seal.comparisonSha256 ? ["comparison.json"] : []),
        "complete.json",
    ];
    for (const name of names) {
        await writeFile(join(target, name), await regularBytes(join(path, name), 128 * 1024 * 1024), {
            flag: "wx",
            mode: 0o600,
        });
    }
    await readRun(destination, id);
    return target;
}

/** The digest is suitable for pinning a shared reference; it never selects or promotes the newest run. */
export async function referenceDigest(root: string, id: string): Promise<string> {
    await readRun(root, id);
    return createHash("sha256")
        .update(await regularBytes(join(root, id, "complete.json"), 4096))
        .digest("hex");
}

export async function historyIndex(root: string) {
    await realDirectory(root);
    const rows = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !/^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{8}$/u.test(entry.name)) {
            continue;
        }
        try {
            const report = await readRun(root, entry.name);
            rows.push({
                id: entry.name,
                revision: report.metadata.revision,
                finishedAt: report.metadata.finishedAt,
                status: report.status,
                profile: report.metadata.profile.fingerprint,
                covered: report.coverage.filter((row) => row.status === "covered").length,
                required: report.coverage.length,
            });
        } catch {
            rows.push({ id: entry.name, status: "incomplete-or-corrupt" as const });
        }
    }
    return rows.sort((a, b) => b.id.localeCompare(a.id));
}
