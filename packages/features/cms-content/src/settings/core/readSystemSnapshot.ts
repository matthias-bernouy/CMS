import type { ContentRepository } from "@bernouy/cms-content";

/** Reads settings and their optimistic revision from one stable repository state. */
export async function readSystemSnapshot(repository: ContentRepository) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const revision = await repository.getSystemRevision();
        const system = await repository.getSystem();
        if ((await repository.getSystemRevision()) === revision) {
            return { revision, system };
        }
    }
    throw new Error("System settings changed repeatedly while reading");
}
