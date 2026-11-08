import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledResourceSource } from "../../../../src/runtime/stores/resources/source";

const digest = "sha256:" + "a".repeat(64);
test("base files are local, profile-specific, language-aware and optional until explicitly requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-base-source-"));
    const signal = new AbortController().signal;
    try {
        await mkdir(join(root, "ulvia"));
        await Bun.write(join(root, "ulvia/en.zip"), "English ZIP");
        await Bun.write(join(root, "ulvia/en.zip.sha256"), digest + "\n");
        const source = bundledResourceSource("ulvia", root);
        expect(await (await source("fr-CA", signal))!.bytes.text()).toBe("English ZIP");
        await Bun.write(join(root, "ulvia/fr.zip"), "French ZIP");
        await Bun.write(join(root, "ulvia/fr.zip.sha256"), digest);
        expect(await (await source("fr-CA", signal))!.bytes.text()).toBe("French ZIP");
        expect((await source("fr", signal))!.digest).toBe(digest);
        expect(await bundledResourceSource("repository", root)("en", signal)).toBeNull();
        expect(() => bundledResourceSource("../escape", root)).toThrow("profile");
        await expect(source("../../escape", signal)).rejects.toThrow("locale");
        await Bun.write(join(root, "ulvia/fr.zip.sha256"), "a".repeat(1024));
        await expect(source("fr", signal)).rejects.toThrow("limit");
        await rm(join(root, "ulvia/fr.zip.sha256"));
        await expect(source("fr", signal)).rejects.toThrow();
        const aborted = AbortSignal.abort(new Error("cancelled"));
        await expect(source("en", aborted)).rejects.toThrow("cancelled");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
