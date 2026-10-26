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
