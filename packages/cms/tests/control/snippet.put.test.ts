import { describe, test, expect } from "bun:test";
import putSnippet from "src/control/api/snippet/snippet.put";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import type { TPage, TSnippet } from "src/socle/interfaces/models";

function makeSystem(opts: {
    updatedSnippet?: TSnippet | null;
    pagesUsing?: TPage[];
} = {}) {
    const updateCalls: { id: string; data: Partial<TSnippet> }[] = [];
    const deleteSpy: string[] = [];
    const cms: any = {
        repository: {
            updateSnippet: async (id: string, data: Partial<TSnippet>) => {
                updateCalls.push({ id, data });
                return opts.updatedSnippet === undefined
                    ? { id, identifier: "kept", name: "n", description: "", content: "", category: "", createdAt: new Date(), updatedAt: new Date(), ...data }
                    : opts.updatedSnippet;
            },
            findPagesUsingSnippet: async (_identifier: string) => opts.pagesUsing ?? [],
        },
        cache: {
            delete: (k: string) => { deleteSpy.push(k); },
        },
    };
    return { cms, updateCalls, deleteSpy };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/snippet", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

describe("PUT /api/snippet (update)", () => {
    test("throws when id is missing", async () => {
        const { cms } = makeSystem();
        await expect(putSnippet(makeRequest({ name: "n" }), cms))
            .rejects.toThrow(/Missing param id/);
    });

    test("throws when name is missing", async () => {
        const { cms } = makeSystem();
        await expect(putSnippet(makeRequest({ id: "snip-1" }), cms))
            .rejects.toThrow(/Missing param name/);
    });

    test("throws when target snippet does not exist", async () => {
        const { cms } = makeSystem({ updatedSnippet: null });
        await expect(putSnippet(makeRequest({ id: "missing", name: "n" }), cms))
            .rejects.toThrow(/Unknown snippet id/);
    });

    test("happy path: passes update data to repository", async () => {
        const { cms, updateCalls } = makeSystem();
        const res = await putSnippet(
            makeRequest({
                id: "snip-1",
                name: "New name",
                category: "layout",
                description: "d",
                content: "<p>c</p>",
            }),
            cms
        );
        expect(res.ok).toBe(true);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0]?.id).toBe("snip-1");
        expect(updateCalls[0]?.data.name).toBe("New name");
        expect(updateCalls[0]?.data.category).toBe("layout");
    });

    test("invalidates cache for every page using the snippet", async () => {
        const { cms, deleteSpy } = makeSystem({
            pagesUsing: [
                { id: "a", path: "/a", title: "", description: "", content: "", visible: true, tags: [] },
                { id: "b", path: "/b", title: "", description: "", content: "", visible: true, tags: [] },
            ],
        });
        await putSnippet(makeRequest({ id: "snip-1", name: "n", content: "fresh" }), cms);
        expect(deleteSpy).toContain(P9R_CACHE.page("/a"));
        expect(deleteSpy).toContain(P9R_CACHE.page("/b"));
    });

    test("no cache deletes when no page references the snippet", async () => {
        const { cms, deleteSpy } = makeSystem({ pagesUsing: [] });
        await putSnippet(makeRequest({ id: "snip-1", name: "n" }), cms);
        expect(deleteSpy).toHaveLength(0);
    });

    test("name is trimmed before persistence", async () => {
        const { cms, updateCalls } = makeSystem();
        await putSnippet(makeRequest({ id: "snip-1", name: "  New  " }), cms);
        expect(updateCalls[0]?.data.name).toBe("New");
    });
});
