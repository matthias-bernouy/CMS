import { assertRepositoryNamespace } from "@bernouy/repository/repository/namespaces";
import type { RepositoryNamespaceView } from "@bernouy/repository/repository/namespaces";
import { NamespaceAccessError } from "@bernouy/repository/repository/authoring";
import type { NamespaceInventoryQuery, NamespaceInventoryPage } from "@bernouy/repository/repository/authoring";

export function validateNamespaceQuery(input: NamespaceInventoryQuery): number {
    const limit = input.limit ?? 25;
    if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 32 ||
        Object.keys(input).some((key) => !["limit", "cursor", "namespace"].includes(key))
    ) {
        throw new NamespaceAccessError("Invalid namespace inventory query");
    }
    for (const value of [input.cursor, input.namespace]) {
        if (value !== undefined) {
            assertRepositoryNamespace(value);
        }
    }
    return limit;
}

/** The remote account inventory is bounded to 32 names; no local ownership cache exists. */
export function namespaceInventory(
    repositoryId: string,
    entries: readonly RepositoryNamespaceView[],
    input: NamespaceInventoryQuery,
): NamespaceInventoryPage {
    const limit = validateNamespaceQuery(input);
    const records = entries
        .filter(
            (entry) =>
                (!input.namespace || entry.namespace === input.namespace) &&
                (!input.cursor || entry.namespace > input.cursor),
        )
        .sort((a, b) => (a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0));
    const page = records.slice(0, limit);
    const checkedAt = new Date().toISOString();
    return {
        items: page.map((entry) => ({
            namespace: entry.namespace,
            repositoryId,
            access: entry.state === "active" ? "owned" : "suspended",
            revision: entry.revision,
            checkedAt,
        })),
        nextCursor: records.length > limit ? page.at(-1)!.namespace : null,
    };
}
