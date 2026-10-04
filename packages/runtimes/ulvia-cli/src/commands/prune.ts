import type { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";

export async function pruneCommand(
    args: readonly string[],
    repository: LocalCollectionRepository,
    log: (message: string) => void,
): Promise<void> {
    if (args.length) {
        throw new Error("Usage: ulvia prune");
    }
    await repository.prune();
    log("Local repository cleared");
}
