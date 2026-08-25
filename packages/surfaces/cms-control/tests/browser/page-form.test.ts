import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../src/static/assets/control-components.js");
const pagesPath = resolve(import.meta.dir, "../../src/static/admin/_content/pages.html");
const waitOptions = { timeout: 5_000 };

async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + waitOptions.timeout;
    while (!condition()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for the expected browser request.");
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

test("page forms derive, validate, and check paths in a real browser", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const availabilityRequests: URL[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.resourceType() === "document") {
                await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
            } else if (url.pathname === "/api/page/exists") {
                availabilityRequests.push(url);
                const path = url.searchParams.get("path");
                const currentPath = url.searchParams.get("current-path");
                await route.fulfill({ json: { exists: path === "/taken" && currentPath !== path } });
            } else {
                await route.fulfill({ json: [] });
            }
        });
        await page.goto("http://cms.test/admin/pages");
        await page.setContent((await readFile(pagesPath, "utf8")).replaceAll("{{BASE_PATH}}", ""));
        await page.addScriptTag({ path: bundlePath });
        await page.waitForFunction(
            () => customElements.get("cms-page-form-controller") !== undefined,
            undefined,
            waitOptions,
        );
        await page.locator("#create-page-modal").evaluate((modal) => modal.setAttribute("open", ""));

        const form = page.locator("#create-page-form");
        const titleControl = form.locator('p9r-input[name="title"]');
        const pathControl = form.locator('p9r-input[name="path"]');
        const titleInput = titleControl.locator("input");
        const pathInput = pathControl.locator("input");
        const pathError = pathControl.locator(".error");

        expect(await titleControl.getAttribute("maxlength")).toBe("70");
        expect(await titleControl.getAttribute("required")).not.toBeNull();
        expect(await pathControl.getAttribute("hint")).toContain("single slashes");
        expect(await pathControl.getAttribute("help")).toContain("public URL");

        await titleInput.fill("À propos de l’équipe");
        await page.waitForFunction(
            () =>
                document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value ===
                "/a-propos-de-l-equipe",
            undefined,
            waitOptions,
        );

        await pathInput.fill("/custom-path");
        await titleInput.fill("A different title");
        expect(await pathControl.evaluate((control: HTMLElement & { value: string }) => control.value)).toBe(
            "/custom-path",
        );

        await pathInput.fill("/bad path");
        expect(await pathError.textContent()).toContain("Use only letters, numbers, hyphens");
        expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false);

        await pathInput.fill("/taken");
        await pathInput.press("Tab");
        await page.waitForFunction(
            () =>
                document.querySelector('p9r-input[name="path"]')?.shadowRoot?.querySelector(".error")?.textContent ===
                "A page already uses this path.",
            undefined,
            waitOptions,
        );
        expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false);

        await pathInput.fill("/available");
        await pathInput.press("Tab");
        await page.waitForFunction(
            () =>
                document.querySelector('p9r-input[name="path"]')?.shadowRoot?.querySelector<HTMLElement>(".error")
                    ?.hidden === true,
            undefined,
            waitOptions,
        );
        expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(true);

        await form.evaluate((element) => {
            element.dispatchEvent(
                new CustomEvent("cms-source:failed", {
                    detail: { body: { field: "path", error: "The server rejected this path." } },
                }),
            );
        });
        expect(await pathError.textContent()).toBe("The server rejected this path.");

        await form.evaluate((element: HTMLFormElement) => {
            element.dispatchEvent(new CustomEvent("cms-source:success", { detail: { body: null } }));
            element.reset();
        });
        await titleInput.fill("Fresh page");
        await page.waitForFunction(
            () =>
                document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value ===
                "/fresh-page",
            undefined,
            waitOptions,
        );

        await page.locator("body").evaluate((body) => {
            body.insertAdjacentHTML(
                "beforeend",
                `<form id="edit-page-form"><p9r-input name="title" value="Existing title"></p9r-input></form>
                 <p9r-input form="edit-page-form" name="path" value="/existing"></p9r-input>
                 <cms-page-form-controller form="edit-page-form" mode="edit" current-path="/existing" availability-url="/api/page/exists" hidden></cms-page-form-controller>`,
            );
        });
        const editTitleControl = page.locator('#edit-page-form p9r-input[name="title"]');
        const editPathControl = page.locator('p9r-input[form="edit-page-form"][name="path"]');
        expect(
            await editPathControl.evaluate(
                (control: HTMLElement & { form: HTMLFormElement | null }) => control.form?.id,
            ),
        ).toBe("edit-page-form");
        await editTitleControl.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "Changed title";
            control.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(await editPathControl.evaluate((control: HTMLElement & { value: string }) => control.value)).toBe(
            "/existing",
        );
        await editPathControl.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "/bad path";
            control.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(await editPathControl.getAttribute("error")).toContain("Use only letters, numbers, hyphens");
        await editPathControl.evaluate((control: HTMLElement & { value: string }) => {
            control.value = "/existing";
            control.dispatchEvent(new Event("input", { bubbles: true }));
            control.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await waitFor(() =>
            availabilityRequests.some(
                (url) =>
                    url.searchParams.get("path") === "/existing" &&
                    url.searchParams.get("current-path") === "/existing",
            ),
        );
        expect(
            availabilityRequests.some(
                (url) =>
                    url.searchParams.get("path") === "/existing" &&
                    url.searchParams.get("current-path") === "/existing",
            ),
        ).toBe(true);
        expect(pageErrors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);
