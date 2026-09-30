import { resolve } from "node:path";
import type { LocalCollectionRepository } from "../repository/local";
import { prepareCollectionRelease } from "../release/source";

export async function releaseCommand(
    args: readonly string[],
    cwd: string,
    repository: LocalCollectionRepository,
    log: (message: string) => void,
): Promise<void> {
    if (args.length !== 1 || args[0]!.startsWith("-")) {
        throw new Error("Usage: ulvia release <collection-directory>");
    }
    const artifact = await prepareCollectionRelease(resolve(cwd, args[0]!));
    const added = await repository.store(artifact);
    const { publisherId, collectionId, version } = artifact.release;
    log(`${added ? "+" : "="} ${publisherId}/${collectionId}@${version} (${artifact.digest})`);
}
