import { describe, test, expect } from "bun:test";
import pageExists from "src/control/api/page/exists.get";
import type { TPage } from "src/socle/interfaces/models";

function makeSystem(paths: string[]) {
    const cms: any = {
        repository: {
            getPage: async (path: string): Promise<TPage | null> => {
                if (!paths.includes(path)) return null;
                return {
                    id: `page-${path}`,
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
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return new Request(url.toString());
}

describe("GET /api/page-exists", () => {

    test("returns 400 when `path` is missing", async () => {
        const res = await pageExists(makeRequest({}), makeSystem([]));
        expect(res.status).toBe(400);
    });

    test("returns { exists: true, reason: 'taken' } when a page exists at that path", async () => {
        const cms = makeSystem(["/article"]);
        const res = await pageExists(makeRequest({ path: "/article" }), cms);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ exists: true, reason: "taken" });
    });

    test("returns { exists: false } when no page matches", async () => {
        const cms = makeSystem(["/other"]);
        const res = await pageExists(makeRequest({ path: "/article" }), cms);
        expect(await res.json()).toEqual({ exists: false });
    });

    test("ignores the collision when it is the page editing itself", async () => {
        const cms = makeSystem(["/article"]);
        const res = await pageExists(
            makeRequest({
                path: "/article",
                "current-path": "/article",
            }),
            cms,
        );
        expect(await res.json()).toEqual({ exists: false });
    });

    test("still flags the collision when current-path differs from the candidate", async () => {
        const cms = makeSystem(["/article"]);
        // User renamed from /old to /article — /article is occupied by someone else.
        const res = await pageExists(
            makeRequest({
                path: "/article",
                "current-path": "/old",
            }),
            cms,
        );
        expect(await res.json()).toEqual({ exists: true, reason: "taken" });
    });
});
