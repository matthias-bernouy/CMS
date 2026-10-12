import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBindingCoreRuntimeEntry, loadComponentRuntimeEntry } from "@bernouy/cms-content/runtime-assets";
import { buildContentBrowserAssets } from "@bernouy/cms-content/runtime-assets/build";

describe("content browser runtime assets", () => {
    test("exposes the generic component base through the public runtime bundle", async () => {
        const entry = await loadComponentRuntimeEntry();
        const source = new TextDecoder().decode(entry.raw);

        expect(entry.contentType).toBe("text/javascript");
        expect(source).toMatch(/window\.cmsRuntime\s*=\s*\{[\s\S]*\bComponent\b/);
        expect(source).not.toContain("syncProviderMediaImage");

        (window as any).cmsRuntime = {};
        window.eval(source);
        expect(typeof (window as any).cmsRuntime.Component).toBe("function");
        expect((window as any).cmsRuntime.Composition).toBeUndefined();
        expect((window as any).cmsRuntime.PROVIDER_IMAGE_WIDTHS).toBeUndefined();
    });

    test("bundles only the technical binding runtime", async () => {
        const entry = await loadBindingCoreRuntimeEntry();
        const source = new TextDecoder().decode(entry.raw);

        expect(source).toContain("cms-binding-core");
        expect(source).toContain("setSourceContext");
        expect(source).toContain("sourceFormRequest");
        expect(source).not.toContain("cms-signup-legal-consent");
        expect(source).not.toContain("cms-login-methods");
        expect(source).not.toContain("node:crypto");
        expect(source).not.toContain("mongodb");
    });

    test("ships browser assets generated from the current entries", async () => {
        const directory = await mkdtemp(join(tmpdir(), "cms-kernel-assets-"));
        try {
            await buildContentBrowserAssets(directory);
            const shippedEntries = {
                "component.js": await loadComponentRuntimeEntry(),
                "binding-core.js": await loadBindingCoreRuntimeEntry(),
            };
            for (const filename of ["component.js", "binding-core.js"] as const) {
                const [generated, shippedBytes] = await Promise.all([
                    readFile(join(directory, filename)),
                    Promise.resolve(shippedEntries[filename].raw),
                ]);
                expect(generated).toEqual(shippedBytes);
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
