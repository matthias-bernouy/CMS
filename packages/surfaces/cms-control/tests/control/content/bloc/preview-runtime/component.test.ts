import { describe, expect, test } from "bun:test";
import { buildPreviewComponentRuntime } from "cms-control/core/content/bloc/preview/runtime/buildComponent";

function previewCms() {
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

describe("Bloc preview component runtime", () => {
    test("serves the provider media runtime through window.cmsRuntime", async () => {
        const response = await buildPreviewComponentRuntime(
            new Request("http://localhost/cms/api/bloc/preview"),
            previewCms() as never,
        );
        const js = await response.text();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/javascript");
        expect(js).toContain("syncProviderMediaImage");
        expect(js).not.toContain("syncResponsiveSourceImageElement");

        (window as any).cmsRuntime = {};
        window.eval(js);
        expect((window as any).cmsRuntime.PROVIDER_IMAGE_WIDTHS).toEqual([
            64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560,
        ]);
        expect((window as any).cmsRuntime.syncProviderMediaImage).toBeFunction();
    });

    test("revalidates an arbitrary preview query version", async () => {
        const response = await buildPreviewComponentRuntime(
            new Request("http://localhost/cms/api/bloc/preview?v=arbitrary"),
            previewCms() as never,
        );
        expect(response.headers.get("cache-control")).toBe("no-cache, must-revalidate");
    });
});
