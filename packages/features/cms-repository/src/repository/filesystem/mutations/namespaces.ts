import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { RepositoryNamespace, RepositoryNamespaceStore } from "cms-repository/repository/namespaces/interfaces";
import { assertRepositoryNamespace } from "cms-repository/repository/namespaces/proofs";
import { parseNamespaceState } from "cms-repository/repository/namespaces/state";
import { withRepositoryWriteLock } from "../core/lock";
import { durableRename, durableWriteFile, ensureDurableDirectory } from "../core/durable";

/** Each immutable revision includes its audit event. One atomic pointer controls visibility. */
export class FilesystemRepositoryNamespaceStore implements RepositoryNamespaceStore {
    constructor(private readonly root: string) {}

    async get(namespace: string, revision?: number): Promise<RepositoryNamespace | null> {
        assertRepositoryNamespace(namespace);
        const directory = join(this.root, ".namespaces", namespace);
        const current = await readFile(join(directory, "current.json")).catch(missing);
        if (!current) {
            return null;
        }
        const state = parseNamespaceState(current, namespace);
        if (revision === undefined || revision === state.revision) {
            return Object.freeze(state);
        }
        if (!Number.isSafeInteger(revision) || revision < 1 || revision > state.revision) {
            return null;
        }
        const bytes = await readFile(join(directory, `${revision}.json`)).catch(missing);
        const historical = bytes ? parseNamespaceState(bytes, namespace) : null;
        if (historical && historical.revision !== revision) {
            throw new Error("Invalid namespace history revision");
        }
        return historical;
    }

    async exclusive<T>(
        namespace: string,
        operation: (
            current: RepositoryNamespace | null,
            save: (next: RepositoryNamespace) => Promise<void>,
        ) => Promise<T>,
    ): Promise<T> {
        assertRepositoryNamespace(namespace);
        const directory = join(this.root, ".namespaces", namespace);
        return withRepositoryWriteLock(directory, async () => {
            const current = await this.get(namespace);
            return operation(current, async (next) => {
                if (next.namespace !== namespace || next.revision !== (current?.revision ?? 0) + 1) {
                    throw new Error("Invalid namespace transition");
                }
                await ensureDurableDirectory(directory, this.root);
                const bytes = canonicalizeIJson(next);
                const temporary = join(directory, `${randomUUID()}.tmp`);
                try {
                    // An unreferenced revision left by a crash may be replaced under the namespace lock.
                    await durableWriteFile(temporary, bytes, { flag: "wx" });
                    await durableRename(temporary, join(directory, `${next.revision}.json`));
                    await durableWriteFile(temporary, bytes, { flag: "wx" });
                    await durableRename(temporary, join(directory, "current.json"));
                } finally {
                    await rm(temporary, { force: true });
                }
            });
        });
    }
}

function missing(error: NodeJS.ErrnoException): null {
    if (error.code === "ENOENT") {
        return null;
    }
    throw error;
}
