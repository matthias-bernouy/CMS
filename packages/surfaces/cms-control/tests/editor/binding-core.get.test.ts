import { describe, expect, test } from "bun:test";
import editorBindingCoreGet from "cms-control/api/editor/binding-core.js.get";

describe("editor binding core endpoint", () => {
    test("serves the public binding core runtime", async () => {
        const cache = new Map<string, unknown>();
        const cms = {
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => {
                    cache.set(key, value);
                },
            },
        };

        const response = await editorBindingCoreGet(
            new Request("http://localhost/cms/api/editor/binding-core.js"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("cms-binding-core");
        expect(js).toContain("customElements.define");
    });
});
