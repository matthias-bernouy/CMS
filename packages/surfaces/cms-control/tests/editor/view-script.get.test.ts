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
                set: (key: string, value: unknown) => { cache.set(key, value); },
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
});
