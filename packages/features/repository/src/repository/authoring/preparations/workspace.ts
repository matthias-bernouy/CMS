import { mkdtemp, readdir, stat, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { withRepositoryWriteLock } from "../../filesystem/core/lock";
import { PREPARATION_ID, PREPARATION_LIMIT, PREPARATION_TTL_MS } from "./limits";
import { PreparationQuotaError } from "./errors";

/** Reserve a slot before compiling; all authoring kinds share this process-safe budget. */
export function reservePreparationWorkspace(root: string): Promise<string> {
    return withRepositoryWriteLock(root, async () => {
        let retained = 0;
        for (const entry of await readdir(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || (!entry.name.startsWith("prepare-") && !PREPARATION_ID.test(entry.name))) {
                continue;
            }
            const path = join(root, entry.name);
            if ((await stat(path)).mtimeMs < Date.now() - PREPARATION_TTL_MS) {
                await rm(path, { recursive: true, force: true });
            } else {
                retained += 1;
            }
        }
        if (retained >= PREPARATION_LIMIT) {
            throw new PreparationQuotaError(retained);
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
