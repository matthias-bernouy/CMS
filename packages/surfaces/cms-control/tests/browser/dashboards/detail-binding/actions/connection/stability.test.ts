import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { installConnectionRoutes } from "./fixture";
const bundle = await Bun.file(
    resolve(import.meta.dir, "../../../../../../src/static/assets/control-components.js"),
).text();
const styles = await Bun.file(
    resolve(import.meta.dir, "../../../../../../../../foundation/components/dist/style.css"),
).text();

test("connection saves lock the form through rereading and retain selection and bottom scroll", async () => {
    const browser = await chromium.launch();
    const captures = process.env.CMS_CONNECTION_STABILITY_CAPTURES;
    if (captures) {
        await mkdir(captures, { recursive: true });
    }
    try {
        for (const width of [1440, 390]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            page.setDefaultTimeout(5000);
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            const fixture = await installConnectionRoutes(page, bundle, styles, true);
            await page.goto("http://cms.test/admin/sources?integration=service");
            const country = page.locator('[data-field-control="country"] input');
            const notes = page.locator('[data-field-control="notes"] textarea');
            const save = page.getByRole("button", { name: "Save settings", exact: true });
            await country.fill("be");
            await notes.fill("Notes before saving");
            await notes.evaluate((node: HTMLTextAreaElement) => {
                node.focus();
                node.setSelectionRange(6, 15);
            });
            const before = await notes.evaluate((node: HTMLTextAreaElement) => {
                const scrolls: number[] = [];
                for (
                    let parent: HTMLElement | null = node;
                    parent;
                    parent = parent.parentElement ?? ((parent.getRootNode() as ShadowRoot).host as HTMLElement | null)
                ) {
                    scrolls.push(parent.scrollTop);
                }
                const box = node.getBoundingClientRect();
                return {
                    scrolls,
                    y: box.y,
                    value: node.value,
                    start: node.selectionStart,
                    end: node.selectionEnd,
                    focused: node.matches(":focus"),
                };
            });
            expect(before.focused).toBe(true);
            const release = fixture.holdSave();
            await page.locator("[data-detail-save]").evaluate((form: HTMLFormElement) => form.requestSubmit());
            await page.waitForFunction(() =>
                document.querySelector("cms-dashboard-w-detail")?.hasAttribute("aria-busy"),
            );
            await page.keyboard.type("blocked");
            expect(await notes.inputValue()).toBe(before.value);
            expect(fixture.writes).toHaveLength(1);
            if (captures) {
                await page.screenshot({ path: `${captures}/${width}-pending.png` });
            }
            release();
            await page.waitForFunction(
                () => !document.querySelector("cms-dashboard-w-detail")?.hasAttribute("aria-busy"),
            );
            expect(await country.inputValue()).toBe("BE");
            for (let frame = 0; frame < 5; frame += 1) {
                await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
                const after = await notes.evaluate((node: HTMLTextAreaElement) => {
                    const scrolls: number[] = [];
                    for (
                        let parent: HTMLElement | null = node;
                        parent;
                        parent =
                            parent.parentElement ?? ((parent.getRootNode() as ShadowRoot).host as HTMLElement | null)
                    ) {
                        scrolls.push(parent.scrollTop);
                    }
                    const box = node.getBoundingClientRect();
                    return {
                        scrolls,
                        y: box.y,
                        value: node.value,
                        start: node.selectionStart,
                        end: node.selectionEnd,
                        focused: node.matches(":focus"),
                    };
                });
                expect(after).toEqual(before);
            }
            if (captures) {
                await page.screenshot({ path: `${captures}/${width}-saved.png` });
            }
            expect(fixture.settings().values.country).toBe("BE");
            expect(fixture.settings().values.notes).toBe("Notes before saving");
            expect(
                fixture.requests.filter((request) => request === "GET /.cms/sources/service/getConnection"),
            ).toHaveLength(2);
            await country.fill("de");
            const saved = page.waitForResponse(
                (response) =>
                    response.request().method() === "POST" && response.url().includes("/service/saveConnection"),
            );
            await save.click();
            await saved;
            await page.waitForFunction(
                () => !document.querySelector("cms-dashboard-w-detail")?.hasAttribute("aria-busy"),
            );
            expect(fixture.writes[1]?.expectedRevision).toBe("v2");
            await page.reload();
            await country.waitFor();
            expect(await country.inputValue()).toBe("DE");
            expect(await notes.inputValue()).toBe(before.value);
            expect(fixture.settings().values.metadata).toEqual({ keep: true });
            expect(errors).toEqual([]);
            await page.close();
        }
    } finally {
        await browser.close();
    }
}, 30000);
