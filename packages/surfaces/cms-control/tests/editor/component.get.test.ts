import { describe, expect, test } from "bun:test";
import editorComponentGet from "cms-control/api/editor/component.js.get";

function editorCms() {
    const entries = new Map<string, unknown>();
    return {
        cache: {
            get: (key: string) => entries.get(key) ?? null,
            set: (key: string, value: unknown) => {
                entries.set(key, value);
            },
        },
    };
}

describe("editor component runtime endpoint", () => {
    test("serves the provider media runtime through window.p9r", async () => {
        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js"),
            editorCms() as never,
        );
        const js = await response.text();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("syncProviderMediaImage");
        expect(js).not.toContain("syncResponsiveSourceImageElement");

        (window as any).p9r = {};
        window.eval(js);
        expect((window as any).p9r.PROVIDER_IMAGE_WIDTHS).toEqual([
            64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560,
        ]);
        expect((window as any).p9r.syncProviderMediaImage).toBeFunction();
    });

    test("revalidates an arbitrary editor query version", async () => {
        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js?v=arbitrary"),
            editorCms() as never,
        );
        expect(response.headers.get("cache-control")).toBe("no-cache, must-revalidate");
    });
});
