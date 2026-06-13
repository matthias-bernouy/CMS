import { describe, expect, test } from "bun:test";
import editorScriptGet from "cms-control/api/editor/script.js.get";

describe("editor catalog script endpoint", () => {
    test("serves editor scripts without view scripts", async () => {
        const cache = new Map<string, unknown>();
        const cms = {
            repository: {
                getBlocsJS: async () => [
                    {
                        id:       "demo-card",
                        viewJS:   "window.__viewOnly = true;",
                        editorJS: "window.p9rEditor.registerEditor({ editor: class {} });",
                    },
                ],
            },
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => { cache.set(key, value); },
            },
        };

        const response = await editorScriptGet(
            new Request("http://localhost/cms/api/editor/script.js"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("p9rEditor.registerEditor");
        expect(js).toContain("demo-card");
        expect(js).not.toContain("__viewOnly");
    });

    test("normalizes default-content placeholders in stored editor scripts", async () => {
        const cache = new Map<string, unknown>();
        const cms = {
            repository: {
                getBlocsJS: async () => [
                    {
                        id:       "placeholder-card",
                        viewJS:   "",
                        editorJS: "window.p9rEditor.registerEditor({ defaultContent: BE5_DEFAULT_CONTENT_TO_BE_REPLACED, editor: class {} });",
                    },
                ],
            },
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => { cache.set(key, value); },
            },
        };

        const response = await editorScriptGet(
            new Request("http://localhost/cms/api/editor/script.js"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(js).toContain(`defaultContent: ""`);
        expect(js).not.toContain("BE5_DEFAULT_CONTENT_TO_BE_REPLACED");
    });
});
