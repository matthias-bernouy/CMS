import { describe, test, expect } from "bun:test";
import putPage from "src/control/api/page/page.put";
import type { TPage } from "src/socle/interfaces/models";

function makeSystem(opts: { existing?: TPage | null } = {}) {
    const updateCalls: TPage[] = [];
    const cms: any = {
        repository: {
            getPageById: async (_id: string) => opts.existing ?? null,
            updatePage: async (page: TPage) => { updateCalls.push(page); },
        },
    };
    return { cms, updateCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/page", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

const existingPage: TPage = {
    id: "page-1",
    path: "/old",
    title: "Old",
    description: "old desc",
    content: "<p>old</p>",
    visible: false,
    tags: ["legacy"],
};

describe("PUT /api/page (update)", () => {
    test("throws when id is missing", async () => {
        const { cms } = makeSystem();
        await expect(putPage(makeRequest({ title: "T", path: "/a" }), cms))
            .rejects.toThrow(/Missing param id/);
    });

    test("throws when title is missing", async () => {
        const { cms } = makeSystem();
        await expect(putPage(makeRequest({ id: "x", path: "/a" }), cms))
            .rejects.toThrow(/Missing param title/);
    });

    test("throws when path is missing", async () => {
        const { cms } = makeSystem();
        await expect(putPage(makeRequest({ id: "x", title: "T" }), cms))
            .rejects.toThrow(/Missing param path/);
    });

    test("throws when path format is invalid", async () => {
        const { cms } = makeSystem({ existing: existingPage });
        await expect(putPage(makeRequest({ id: "page-1", title: "T", path: "no-leading-slash" }), cms))
            .rejects.toThrow(/Invalid param path/);
    });

    test("throws when target page does not exist", async () => {
        const { cms, updateCalls } = makeSystem({ existing: null });
        await expect(putPage(makeRequest({ id: "missing", title: "T", path: "/a" }), cms))
            .rejects.toThrow(/Unknown page id/);
        expect(updateCalls).toHaveLength(0);
    });

    test("happy path: merges DTO over existing record", async () => {
        const { cms, updateCalls } = makeSystem({ existing: existingPage });
        const res = await putPage(
            makeRequest({
                id: "page-1",
                title: "New title",
                path: "/new",
                content: "<p>new</p>",
                description: "new desc",
                visible: true,
                tags: ["a", "b"],
            }),
            cms
        );
        expect(res.ok).toBe(true);
        expect(updateCalls).toHaveLength(1);
        const updated = updateCalls[0]!;
        expect(updated.id).toBe("page-1");
        expect(updated.title).toBe("New title");
        expect(updated.path).toBe("/new");
        expect(updated.content).toBe("<p>new</p>");
        expect(updated.description).toBe("new desc");
        expect(updated.visible).toBe(true);
        expect(updated.tags).toEqual(["a", "b"]);
    });

    test("title is trimmed before persistence", async () => {
        const { cms, updateCalls } = makeSystem({ existing: existingPage });
        await putPage(makeRequest({ id: "page-1", title: "  New  ", path: "/new" }), cms);
        expect(updateCalls[0]?.title).toBe("New");
    });
});
