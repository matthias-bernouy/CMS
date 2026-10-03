import { describe, test, expect } from "bun:test";
import pageExists from "cms-control/api/_content/page/_routes/exists.get";
import type { TPage } from "@bernouy/cms-content";

function makeSystem(paths: string[]) {
    const cms: any = {
        repository: {
            getSystem: async () => ({ site: { language: "en", additionalLanguages: ["fr"] } }),
            getPageRoute: async (path: string) =>
                paths.includes(path) ? { path, state: "current", pageId: `page-${path}`, language: "en" } : null,
            getPage: async (path: string): Promise<TPage | null> => {
                if (!paths.includes(path)) {
                    return null;
                }
                return {
                    id: `page-${path}`,
                    revision: 1,
                    path,
                    title: "",
                    description: "",
                    content: "",
                    visible: true,
                    tags: [],
                };
            },
        },
    };
    return cms;
}

function makeRequest(query: Record<string, string>): Request {
    const url = new URL("http://localhost/cms/api/page-exists");
    for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
    }
    return new Request(url.toString());
}

describe("GET /api/page-exists", () => {
    test("returns 400 when `path` is missing", async () => {
        const res = await pageExists(makeRequest({}), makeSystem([]));
        expect(res.status).toBe(400);
    });

    test("returns a conflict when a page exists at that path", async () => {
        const cms = makeSystem(["/article"]);
        const res = await pageExists(makeRequest({ path: "/article" }), cms);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ exists: true, reason: "current" });
    });

    test("returns { exists: false } when no page matches", async () => {
        const cms = makeSystem(["/other"]);
        const res = await pageExists(makeRequest({ path: "/article" }), cms);
        expect(await res.json()).toEqual({ exists: false });
    });

    test("treats a default-language path beginning with its code literally", async () => {
        const cms = makeSystem(["/en/article"]);
        for (const request of [
            makeRequest({ path: "/en/article" }),
            makeRequest({ path: "/en/article", language: "en" }),
        ]) {
            const res = await pageExists(request, cms);
            expect(await res.json()).toEqual({ exists: true, reason: "current" });
        }
    });

    test("adds the prefix for another language", async () => {
        const cms = makeSystem(["/fr/article"]);
        const res = await pageExists(makeRequest({ path: "/article", language: "fr" }), cms);
        expect(await res.json()).toEqual({ exists: true, reason: "current" });
    });

    test("allows the current route when the page id matches", async () => {
        const cms = makeSystem(["/article"]);
        const res = await pageExists(
            makeRequest({
                path: "/article",
                pageId: "page-/article",
            }),
            cms,
        );
        expect(await res.json()).toEqual({ exists: false });
    });

    test("retired routes remain unavailable to the same page", async () => {
        const cms = makeSystem([]);
        cms.repository.getPageRoute = async (path: string) => ({
            path,
            state: "redirect",
            pageId: "page-/article",
            language: "en",
        });
        const res = await pageExists(makeRequest({ path: "/article", pageId: "page-/article" }), cms);
        expect(await res.json()).toEqual({ exists: true, reason: "redirect" });
    });

    test("allows a redirect owned by the same page to become current again", async () => {
        const cms = makeSystem([]);
        cms.repository.getPageRoute = async (path: string) => ({
            path,
            state: "redirect",
            pageId: "page-1",
            ownerPageId: "page-1",
            language: "en",
        });
        const res = await pageExists(makeRequest({ path: "/article", pageId: "page-1" }), cms);
        expect(await res.json()).toEqual({ exists: false });
    });
});
