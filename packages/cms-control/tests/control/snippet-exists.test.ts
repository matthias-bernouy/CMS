import { describe, test, expect } from "bun:test";
import snippetExists from "src/control/api/snippet/exists.get";
import type { TSnippet } from "src/socle/interfaces/models";

function makeSystem(identifiers: string[]) {
    const cms: any = {
        repository: {
            getSnippetByIdentifier: async (identifier: string): Promise<TSnippet | null> => {
                if (!identifiers.includes(identifier)) return null;
                return {
                    id: `snippet-${identifier}`,
                    identifier,
                    name: "",
                    description: "",
                    category: "",
                    content: "",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            },
        },
    };
    return cms;
}

function makeRequest(query: Record<string, string>): Request {
    const url = new URL("http://localhost/cms/api/snippet-exists");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return new Request(url.toString());
}

describe("GET /api/snippet-exists", () => {

    test("returns 400 when `identifier` is missing", async () => {
        const res = await snippetExists(makeRequest({}), makeSystem([]));
        expect(res.status).toBe(400);
    });

    test("returns { exists: true } when a snippet with that identifier exists", async () => {
        const cms = makeSystem(["hero-v1"]);
        const res = await snippetExists(makeRequest({ identifier: "hero-v1" }), cms);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ exists: true });
    });

    test("returns { exists: false } when no snippet matches", async () => {
        const cms = makeSystem(["hero-v1"]);
        const res = await snippetExists(makeRequest({ identifier: "hero-v2" }), cms);
        expect(await res.json()).toEqual({ exists: false });
    });

    test("match is case-sensitive", async () => {
        const cms = makeSystem(["hero-v1"]);
        const res = await snippetExists(makeRequest({ identifier: "HERO-V1" }), cms);
        expect(await res.json()).toEqual({ exists: false });
    });
});
