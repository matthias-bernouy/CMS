import type { LocalCollectionRepository } from "../repository/local";

export async function pruneCommand(
    args: readonly string[],
    repository: LocalCollectionRepository,
    log: (message: string) => void,
): Promise<void> {
    if (args.length) {
        throw new Error("Usage: ulvia prune");
    }
    await repository.prune();
    log("Local collection repository cleared");
}
