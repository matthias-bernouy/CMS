import { expect, test } from "bun:test";
import { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import type { RepositoryDiscoverySource } from "@bernouy/cms-repository/repository/search";
import { row } from "./fixture";

function remote(id: string, fail = false): RepositoryDiscoverySource {
    return {
        id,
        search: async () => {
            if (fail) {
                throw new Error("offline");
            }
            const { text: _text, ...result } = row(id);
            return { revision: "same", mode: "lexical", degraded: true, results: [result] };
        },
        read: async () => {
            throw new Error("not used");
        },
    };
}
test("federation exposes partial sources and paginates a stable bounded candidate set", async () => {
    const service = new RepositoryDiscovery([remote("first"), remote("second"), remote("offline", true)]);
    const first = await service.search({ query: "product", limit: 1 });
    expect(first).toMatchObject({ partial: true, unavailableRepositories: ["offline"], degraded: true });
    expect(first.results).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();
    const second = await service.search({ query: "product", limit: 1, cursor: first.nextCursor });
    expect(second.results[0]?.repositoryId).not.toBe(first.results[0]?.repositoryId);
    await expect(service.search({ query: "other", cursor: first.nextCursor })).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
    });
    await expect(service.search({ query: "product", repositoryIds: ["unconfigured"] })).rejects.toThrow(
        "not configured",
    );
    await expect(service.get({ repositoryId: "unconfigured", reference: row().reference })).rejects.toThrow(
        "not configured",
    );
    expect(await new RepositoryDiscovery([]).search({ query: "product" })).toMatchObject({
        partial: false,
        degraded: true,
        results: [],
    });
});

test("identical artifacts merge while same-version digest conflicts remain inspectable", async () => {
    const first = remote("first");
    const second = remote("second");
    second.search = first.search;
    expect((await new RepositoryDiscovery([first, second]).search({ query: "product" })).results).toHaveLength(1);
    const original = second.search;
    second.search = async () => {
        const page = await original({ query: "product" });
        return {
            ...page,
            results: page.results.map((result) => ({
                ...result,
                reference: { ...result.reference, digest: `sha256:${"b".repeat(64)}` },
            })),
        };
    };
    const results = (await new RepositoryDiscovery([first, second]).search({ query: "product" })).results;
    expect(results).toHaveLength(2);
    expect(new Set(results.map((result) => result.repositoryId)).size).toBe(2);
});
