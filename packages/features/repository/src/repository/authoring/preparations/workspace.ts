import { mkdtemp, readdir, stat, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { withRepositoryWriteLock } from "../../filesystem/core/lock";

/** Reserve a slot before compiling; all authoring kinds share this process-safe budget. */
export function reservePreparationWorkspace(root: string): Promise<string> {
    return withRepositoryWriteLock(root, async () => {
        let retained = 0;
        for (const entry of await readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^(?:prepare-|[a-f0-9-]{36}$)/u.test(entry.name)) {
                continue;
            }
            const path = join(root, entry.name);
            if ((await stat(path)).mtimeMs < Date.now() - 7 * 86400_000) {
                await rm(path, { recursive: true, force: true });
            } else {
                retained += 1;
            }
        }
        if (retained >= 64) {
            throw new Error("Prepared resource limit reached; remove an old preparation before adding more");
        }
        return mkdtemp(join(root, "prepare-"));
    });
}

export function commitPreparationWorkspace(root: string, work: string, id: string): Promise<void> {
    return withRepositoryWriteLock(root, () => rename(work, join(root, id)));
}

export function discardPreparationWorkspace(root: string, path: string): Promise<void> {
    return withRepositoryWriteLock(root, () => rm(path, { recursive: true, force: true }));
}
