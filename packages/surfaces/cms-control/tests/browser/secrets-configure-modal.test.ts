import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../src/static/assets/control-components.js");

test("the secret configuration modal renders its title and actions", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.setContent("<main></main>");
        await page.addScriptTag({ path: bundlePath });
        await page.waitForFunction(() => customElements.get("cms-secrets") !== undefined);
        await page.evaluate(() => {
            window.fetch = (async () => Response.json([{ key: "STRIPE_KEY" }])) as unknown as typeof fetch;
            document.querySelector("main")!.append(document.createElement("cms-secrets"));
        });

        const configure = page.locator("cms-secrets [data-action='configure']");
        await configure.waitFor();
        await configure.click();

        const rendered = await page.locator("cms-secrets").evaluate((host) => {
            const modal = host.shadowRoot?.querySelector<HTMLElement>("[data-role='configure-modal']");
            const header = modal?.shadowRoot?.querySelector<HTMLElement>(".header");
            const footer = modal?.shadowRoot?.querySelector<HTMLElement>(".footer");
            if (!modal || !header || !footer) {
                throw new Error("Expected modal header and footer parts");
            }
            return {
                headerDisplay: getComputedStyle(header).display,
                footerDisplay: getComputedStyle(footer).display,
                title: modal.querySelector<HTMLElement>("[slot='title']")?.textContent,
                actions: Array.from(modal.querySelectorAll<HTMLElement>("[slot='footer'] p9r-button")).map((button) =>
                    button.textContent?.trim(),
                ),
            };
        });

        expect(rendered).toEqual({
            headerDisplay: "flex",
            footerDisplay: "flex",
            title: "Configure STRIPE_KEY",
            actions: ["Cancel", "Confirm"],
        });
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);
