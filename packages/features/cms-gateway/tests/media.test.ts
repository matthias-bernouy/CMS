import { expect, test } from "bun:test";
import { providerDerivativeKey } from "@bernouy/cms-gateway/media";

test("provider derivative keys pin installation, generation, recipe, width and format", async () => {
    const media = {
        siteId: "site-a",
        installationId: "install-a",
        contractId: "files",
        releaseDigest: `sha256:${"a".repeat(64)}` as const,
        capabilityId: "file.download",
        fileId: "photo-1",
        generation: "generation-1",
    };
    const recipe = { id: "responsive", version: "1", encoder: "sharp-1", widths: [320, 640], formats: ["webp"] };
    const key = await providerDerivativeKey(media, recipe, 320, "webp");
    expect(key).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await providerDerivativeKey(media, recipe, 320, "webp")).toBe(key);
    expect(await providerDerivativeKey({ ...media, generation: "generation-2" }, recipe, 320, "webp")).not.toBe(key);
    expect(await providerDerivativeKey({ ...media, installationId: "install-b" }, recipe, 320, "webp")).not.toBe(key);
    await expect(providerDerivativeKey(media, recipe, 800, "webp")).rejects.toThrow();
    await expect(providerDerivativeKey(media, recipe, 320, "avif")).rejects.toThrow();
});
