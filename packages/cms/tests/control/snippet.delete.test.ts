import { describe, test, expect } from "bun:test";
import deleteSnippet from "src/control/api/snippet/snippet.delete";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import type { TPage, TSnippet } from "src/socle/interfaces/models";

function makeSystem(opts: {
    snippet?: TSnippet | null;
    pagesUsing?: TPage[];
} = {}) {
    const deleteCalls: string[] = [];
    const deleteSpy: string[] = [];
    const cms: any = {
        repository: {
            getSnippetById: async (_id: string) => opts.snippet ?? null,
            findPagesUsingSnippet: async (_identifier: string) => opts.pagesUsing ?? [],
            deleteSnippet: async (id: string) => { deleteCalls.push(id); },
        },
        cache: {
            delete: (k: string) => { deleteSpy.push(k); },
        },
    };
    return { cms, deleteCalls, deleteSpy };
}

function makeRequest(query: Record<string, string>) {
    const url = new URL("http://localhost/cms/api/snippet");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return new Request(url.toString(), { method: "DELETE" });
}

const heroSnippet: TSnippet = {
    id: "snip-1",
    identifier: "hero",
    name: "Hero",
    description: "",
    content: "",
    category: "",
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe("DELETE /api/snippet", () => {
    test("400 when id missing", async () => {
        const { cms, deleteCalls } = makeSystem();
        const res = await deleteSnippet(makeRequest({}), cms);
        expect(res.status).toBe(400);
        expect(deleteCalls).toHaveLength(0);
    });

    test("404 when snippet not found", async () => {
        const { cms, deleteCalls } = makeSystem({ snippet: null });
        const res = await deleteSnippet(makeRequest({ id: "missing" }), cms);
        expect(res.status).toBe(404);
        expect(deleteCalls).toHaveLength(0);
    });

    test("409 + page list when snippet is in use and force is not set", async () => {
        const { cms, deleteCalls } = makeSystem({
            snippet: heroSnippet,
            pagesUsing: [
                { id: "a", path: "/a", title: "Page A", description: "", content: "", visible: true, tags: [] },
                { id: "b", path: "/b", title: "Page B", description: "", content: "", visible: true, tags: [] },
            ],
        });
        const res = await deleteSnippet(makeRequest({ id: "snip-1" }), cms);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toBe("Snippet is in use");
        expect(body.pages).toEqual([
            { path: "/a", title: "Page A" },
            { path: "/b", title: "Page B" },
        ]);
        expect(deleteCalls).toHaveLength(0);
    });

    test("force=true deletes even when in use, and invalidates cache for each page", async () => {
        const { cms, deleteCalls, deleteSpy } = makeSystem({
            snippet: heroSnippet,
            pagesUsing: [
                { id: "a", path: "/a", title: "", description: "", content: "", visible: true, tags: [] },
                { id: "b", path: "/b", title: "", description: "", content: "", visible: true, tags: [] },
            ],
        });
        const res = await deleteSnippet(makeRequest({ id: "snip-1", force: "true" }), cms);
        expect(res.status).toBe(200);
        expect(deleteCalls).toEqual(["snip-1"]);
        expect(deleteSpy).toContain(P9R_CACHE.page("/a"));
        expect(deleteSpy).toContain(P9R_CACHE.page("/b"));
    });

    test("happy path: deletes and skips cache invalidation when no usages", async () => {
        const { cms, deleteCalls, deleteSpy } = makeSystem({
            snippet: heroSnippet,
            pagesUsing: [],
        });
        const res = await deleteSnippet(makeRequest({ id: "snip-1" }), cms);
        expect(res.status).toBe(200);
        expect(deleteCalls).toEqual(["snip-1"]);
        expect(deleteSpy).toHaveLength(0);
    });
});
