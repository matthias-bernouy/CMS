import { describe, test, expect } from "bun:test";
import postPage from "src/control/api/page/page.post";

function makeSystem() {
    const insertCalls: { path: string; title: string }[] = [];
    const cms: any = {
        repository: {
            insertPage: async (path: string, title: string) => {
                insertCalls.push({ path, title });
            },
        },
    };
    return { cms, insertCalls };
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
        await expect(postPage(makeRequest({ path: "/about" }), cms))
            .rejects.toThrow(/Missing param title/);
    });

    test("throws when path is missing", async () => {
        const { cms } = makeSystem();
        await expect(postPage(makeRequest({ title: "About" }), cms))
            .rejects.toThrow(/Missing param path/);
    });

    test("throws when path format is invalid", async () => {
        const { cms } = makeSystem();
        await expect(postPage(makeRequest({ title: "About", path: "about" }), cms))
            .rejects.toThrow(/Invalid param path/);
    });

    test("throws when title is empty after trim", async () => {
        const { cms } = makeSystem();
        await expect(postPage(makeRequest({ title: "   ", path: "/about" }), cms))
            .rejects.toThrow();
    });

    test("happy path: calls insertPage and returns ok", async () => {
        const { cms, insertCalls } = makeSystem();
        const res = await postPage(makeRequest({ title: "About", path: "/about" }), cms);
        expect(res.ok).toBe(true);
        expect(insertCalls).toEqual([{ path: "/about", title: "About" }]);
    });

    test("title is trimmed before persistence", async () => {
        const { cms, insertCalls } = makeSystem();
        await postPage(makeRequest({ title: "  About  ", path: "/about" }), cms);
        expect(insertCalls[0]?.title).toBe("About");
    });
});
