import type { ContentRepository } from "@bernouy/content";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { createMongoContentRepository } from "../../../application/mongo/contentMongoFixture";

export const editingRepositories = [
    ["memory", async () => new InMemoryContentRepository()],
    [
        "Mongo",
        async () => {
            const { repository } = createMongoContentRepository();
            await repository.init();
            return repository;
        },
    ],
] as const;

export async function editingRepository(create: () => Promise<ContentRepository>) {
    const raw = await create();
    return { raw, repository: new ValidatingContentRepository(raw) };
}
