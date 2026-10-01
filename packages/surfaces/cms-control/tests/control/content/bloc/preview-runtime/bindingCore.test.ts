import { describe, expect, test } from "bun:test";
import { buildPreviewBindingCore } from "cms-control/core/content/bloc/preview/runtime/buildBindingCore";

describe("Bloc preview binding runtime", () => {
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

        const response = await buildPreviewBindingCore(
            new Request("http://localhost/cms/api/bloc/preview"),
            cms as any,
        );
        const js = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("cms-binding-core");
        expect(js).toContain("cms-fixed-range authored");
        expect(js).toContain("customElements.define");
        expect(js).toContain("setSourceContext");
        expect(js).toContain("sourceFormRequest");
    });
});
