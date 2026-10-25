import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
    FilesystemRepositoryNamespaceStore,
    withRepositoryWriteLock,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryNamespaceAuthority } from "@bernouy/cms-repository/repository/namespaces";

/** Identity persists with the volume; signatures cannot be replayed against another Repository. */
export async function createNamespaceAuthority(root: string): Promise<RepositoryNamespaceAuthority> {
    const repositoryId = await withRepositoryWriteLock(root, async () => {
        const path = join(root, ".repository-identity");
        let identity = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (identity === null) {
            identity = randomUUID();
            const temporary = `${path}.${randomUUID()}.tmp`;
            const handle = await open(temporary, "wx", 0o600);
            try {
                await handle.writeFile(identity);
                await handle.sync();
            } finally {
                await handle.close();
            }
            try {
                await rename(temporary, path);
                const directory = await open(root, "r");
                try {
                    await directory.sync();
                } finally {
                    await directory.close();
                }
            } finally {
                await rm(temporary, { force: true });
            }
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(identity)) {
            throw new Error("Invalid persistent Repository identity");
        }
        return identity;
    });
    return new RepositoryNamespaceAuthority(
        repositoryId,
        new FilesystemRepositoryNamespaceStore(root),
        async (namespace) => {
            if (namespace === "ulvia" || namespace.startsWith("ulvia.")) {
                return true;
            }
            for (const directory of ["releases", "contracts", "providers"]) {
                if (await stat(join(root, directory, namespace)).catch(() => null)) {
                    return true;
                }
            }
            return false;
        },
    );
}
