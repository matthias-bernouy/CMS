import { describe, expect, test } from "bun:test";
import editorViewScriptGet from "cms-control/api/editor/view-script.js.get";

describe("editor view script endpoint", () => {
    test("serves bloc view scripts without editor scripts", async () => {
        const cache = new Map<string, unknown>();
        const cms = {
            repository: {
                getBlocsJS: async () => [
                    {
                        id: "demo-card",
                        viewJS: "customElements.define('demo-card', class extends HTMLElement {});",
                        editorJS: "window.__editorOnly = true;",
                    },
                ],
            },
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => {
                    cache.set(key, value);
                },
            },
        };

        const response = await editorViewScriptGet(
            new Request("http://localhost/cms/api/editor/view-script.js"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("customElements.define");
        expect(js).toContain("demo-card");
        expect(js).not.toContain("__editorOnly");
    });

    test("keeps line-comment-only scripts isolated from the following bloc", async () => {
        const cache = new Map<string, unknown>();
        const unsafeId = `native-"image\nnext`;
        const cms = {
            repository: {
                getBlocsJS: async () => [
                    {
                        id: unsafeId,
                        viewJS: "// Native behavior is provided by the browser.",
                        editorJS: "",
                    },
                    {
                        id: "valid-view",
                        viewJS: "window.__validViewLoaded = true;",
                        editorJS: "",
                    },
                ],
            },
            cache: {
                get: (key: string) => cache.get(key) ?? null,
                set: (key: string, value: unknown) => {
                    cache.set(key, value);
                },
            },
        };

        const response = await editorViewScriptGet(
            new Request("http://localhost/cms/api/editor/view-script.js"),
            cms as any,
        );
        const js = await response.text();
        const browser = {} as { __validViewLoaded?: boolean };

        expect(() => new Function("window", js)).not.toThrow();
        new Function("window", js)(browser);

        expect(browser.__validViewLoaded).toBe(true);
        expect(js).toContain(JSON.stringify(`[editor] bloc ${unsafeId} viewJS:`));
    });
});
