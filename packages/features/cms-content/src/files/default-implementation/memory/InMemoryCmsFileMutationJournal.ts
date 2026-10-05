import type { CmsFileMutation, CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";

export class InMemoryCmsFileMutationJournal implements CmsFileMutationJournal {
    private readonly operations = new Map<string, CmsFileMutation>();

    async begin(operation: CmsFileMutation): Promise<boolean> {
        if ([...this.operations.values()].some(({ resourceId }) => resourceId === operation.resourceId)) {
            return false;
        }
        this.operations.set(operation.id, structuredClone(operation));
        return true;
    }

    async find(resourceId: string): Promise<CmsFileMutation | null> {
        const operation = [...this.operations.values()].find((candidate) => candidate.resourceId === resourceId);
        return operation ? structuredClone(operation) : null;
    }

    async list(limit = 100): Promise<readonly CmsFileMutation[]> {
        return [...this.operations.values()]
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .slice(0, limit)
            .map((operation) => structuredClone(operation));
    }

    async complete(id: string): Promise<void> {
        this.operations.delete(id);
    }
}
