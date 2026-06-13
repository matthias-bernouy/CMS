import { describe, expect, test } from "bun:test";
import editorComponentGet from "cms-control/api/editor/component.js.get";

describe("editor component runtime endpoint", () => {
    test("serves the shared Component runtime", async () => {
        const cache = new Map<string, unknown>();
        const cms = {
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => { cache.set(key, value); },
            },
        };

        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("window.p9r");
        expect(js).toContain("Component");
    });
});
