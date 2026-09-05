import { describe, test, expect } from "bun:test";
import postPage from "cms-control/api/_content/page/page.post";

function makeSystem(sourcePages: Record<string, { content: string }> = {}) {
    const insertCalls: { path: string; title: string; content?: string }[] = [];
    const getPageCalls: string[] = [];
    const cms: any = {
        repository: {
            getPage: async (path: string) => {
                getPageCalls.push(path);
                return sourcePages[path] ?? null;
            },
            insertPage: async (path: string, title: string, content?: string) => {
                insertCalls.push({ path, title, ...(content === undefined ? {} : { content }) });
            },
        },
    };
    return { cms, getPageCalls, insertCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/page", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

describe("POST /api/page (create)", () => {
    test("throws when title is missing", async () => {
        const { cms } = makeSystem();
        await expect(postPage(makeRequest({ path: "/about" }), cms)).rejects.toThrow(/Missing param title/);
    });

    test("throws when path is missing", async () => {
        const { cms } = makeSystem();
        await expect(postPage(makeRequest({ title: "About" }), cms)).rejects.toThrow(/Missing param path/);
    });

    test("happy path: calls insertPage and returns ok", async () => {
        const { cms, insertCalls } = makeSystem();
        const res = await postPage(makeRequest({ title: "About", path: "/about" }), cms);
        expect(res.ok).toBe(true);
        expect(insertCalls).toEqual([{ path: "/about", title: "About" }]);
    });

    test("copies content from the selected existing page", async () => {
        const sourceContent = "<main><fixture-hero></fixture-hero></main>";
        const { cms, getPageCalls, insertCalls } = makeSystem({ "/source": { content: sourceContent } });

        const res = await postPage(makeRequest({ title: "Copy", path: "/copy", sourcePath: "/source" }), cms);

        expect(res.ok).toBe(true);
        expect(getPageCalls).toEqual(["/source"]);
        expect(insertCalls).toEqual([{ path: "/copy", title: "Copy", content: sourceContent }]);
    });

    test("rejects a source page that no longer exists", async () => {
        const { cms, insertCalls } = makeSystem();

        await expect(
            postPage(makeRequest({ title: "Copy", path: "/copy", sourcePath: "/missing" }), cms),
        ).rejects.toThrow(/Invalid param sourcePath/);
        expect(insertCalls).toEqual([]);
    });
});
