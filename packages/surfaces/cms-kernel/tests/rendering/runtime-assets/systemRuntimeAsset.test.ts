import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBindingCoreRuntimeEntry } from "cms-kernel/core/assets/browserRuntimeAssets";
import { buildKernelBrowserAssets } from "cms-kernel/tooling/browserAssets";

describe("kernel system runtime asset", () => {
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
            await buildKernelBrowserAssets(directory);
            for (const filename of ["component.js", "binding-core.js"]) {
                const [generated, shipped] = await Promise.all([
                    readFile(join(directory, filename)),
                    readFile(join(import.meta.dir, `../../../assets/browser/${filename}`)),
                ]);
                expect(generated).toEqual(shipped);
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
