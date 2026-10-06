import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { releaseCommand } from "./release";

/** Admits the source-pinned official resources into the persistent local repository. */
export async function bootstrapOfficialRepository(repositoryRoot: string): Promise<void> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const contracts = join(root, "contracts");
    for (const id of await directories(contracts)) {
        await releaseCommand([join(contracts, id)], root, repositoryRoot, () => undefined);
    }
    await releaseCommand([join(root, "providers", "ulvia.official")], root, repositoryRoot, () => undefined);
    await releaseCommand([join(root, "collections", "ulvia-official")], root, repositoryRoot, () => undefined);
}

async function directories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}
