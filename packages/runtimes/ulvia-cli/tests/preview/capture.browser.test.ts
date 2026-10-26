import { chromium } from "playwright";
import { prepareCollectionRelease, renderCollectionExamples } from "@bernouy/cms-repository/collections/build";
import { exampleExplorer } from "../../src/preview/explorer";
import { serveExampleFiles } from "../../src/preview/server";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewCommand } from "../../src/preview/command";
import { writeExampleSource } from "./fixture";

test.skipIf(process.env.ULVIA_RUN_EXAMPLE_BROWSER !== "1")(
    "captures exact viewport dimensions with the real CMS renderer",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-preview-browser-"));
        try {
            const source = await writeExampleSource(root);
            const output = join(root, "preview");
            await previewCommand([source, "--output", output], root, join(root, "repository"), () => {});
            for (const [id, width, height] of [
                ["desktop", 640, 240],
                ["mobile", 320, 160],
            ] as const) {
                const bytes = new DataView(await Bun.file(join(output, `contact--${id}.png`)).arrayBuffer());
                expect(bytes.getUint32(16)).toBe(width);
                expect(bytes.getUint32(20)).toBe(height);
            }
            expect((await Bun.file(join(output, "manifest.json")).json()).captures).toHaveLength(2);
            const rendered = await renderCollectionExamples(await prepareCollectionRelease(source));
            const server = serveExampleFiles(new Map([...rendered.files, ...exampleExplorer(rendered.frames)]));
            const browser = await chromium.launch({ headless: true });
            try {
                const page = await browser.newPage();
                await page.goto(server.url.href);
                const frame = page.frameLocator("#frame");
                const button = frame.getByRole("button", { name: "Contact us" });
                await button.click();
                expect(await button.getAttribute("aria-pressed")).toBe("true");
                await page.selectOption("#example", "1");
                await frame.getByRole("button", { name: "Contact us" }).waitFor();
                expect(await frame.locator("html").evaluate(() => window.innerWidth)).toBe(320);
                expect(
                    await frame.locator("html").evaluate(() => {
                        try {
                            return parent.document !== undefined;
                        } catch {
                            return false;
                        }
                    }),
                ).toBeFalse();
            } finally {
                await browser.close();
                server.stop(true);
            }
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    },
    30_000,
);
