import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewCommand } from "../../src/preview/command";
import { writeExampleSource } from "./fixture";

test("preview exports immutable example data and a sandboxed explorer without publishing", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-preview-"));
    try {
        const source = await writeExampleSource(root);
        const output = join(root, "preview");
        await previewCommand(
            [source, "--output", output, "--no-screenshots"],
            root,
            join(root, "repository"),
            () => {},
        );
        const manifest = await Bun.file(join(output, "manifest.json")).json();
        expect(manifest.release.collectionId).toBe("sample");
        expect(manifest.frames.map((frame: { width: number; height: number }) => [frame.width, frame.height])).toEqual([
            [640, 240],
            [320, 160],
        ]);
        expect(manifest.captures).toEqual([]);
        expect(
            manifest.frames.every(
                (frame: { locale: string; themeMode: string }) => frame.locale === "en" && frame.themeMode === "light",
            ),
        ).toBeTrue();
        expect(await Bun.file(join(output, "index.html")).text()).toContain('sandbox="allow-scripts"');
        expect(await Bun.file(join(output, "contact--mobile.html")).text()).toContain("Contact us");
        await expect(
            previewCommand([source, "--output", source, "--no-screenshots"], root, join(root, "repository"), () => {}),
        ).rejects.toThrow("separate");
        await expect(
            previewCommand([source, "--output", output, "--no-screenshots"], root, join(root, "repository"), () => {}),
        ).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("preview chooses rendering context without modifying the example source", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-preview-context-"));
    try {
        const source = await writeExampleSource(root);
        const definition = join(source, "examples/contact/definition.json");
        const before = await Bun.file(definition).text();
        const output = join(root, "french-dark");
        await previewCommand(
            [source, "--output", output, "--locale", "fr", "--theme-mode", "dark", "--no-screenshots"],
            root,
            join(root, "repository"),
            () => {},
        );
        const manifest = await Bun.file(join(output, "manifest.json")).json();
        expect(
            manifest.frames.every(
                (frame: { locale: string; themeMode: string }) => frame.locale === "fr" && frame.themeMode === "dark",
            ),
        ).toBeTrue();
        expect(await Bun.file(join(output, "contact--mobile.html")).text()).toContain("Contactez-nous");
        expect(await Bun.file(definition).text()).toBe(before);
        for (const args of [
            ["--locale", "not_a_locale"],
            ["--theme-mode", "invalid"],
            ["--locale", "en", "--locale", "fr"],
        ]) {
            await expect(
                previewCommand(
                    [source, "--output", join(root, "invalid"), "--no-screenshots", ...args],
                    root,
                    join(root, "repository"),
                    () => {},
                ),
            ).rejects.toThrow();
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
