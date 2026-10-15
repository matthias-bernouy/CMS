import type { Page } from "playwright";

export async function mutatePages(page: Page, kernelOrigin: string): Promise<void> {
    const createDialog = page.locator("#create-page-dialog");
    if (await createDialog.evaluate((dialog: HTMLDialogElement) => dialog.open)) {
        throw new Error("The create Page dialog must be closed on initial render");
    }
    await page.locator('button[command="show-modal"][commandfor="create-page-dialog"]').click();
    await createDialog.evaluate((dialog: HTMLDialogElement) => {
        if (!dialog.open) {
            throw new Error("The create Page dialog did not open");
        }
    });
    await page
        .locator("#new-page-title")
        .fill("Smoke Page")
        .catch(async (error) => {
            throw new Error(
                `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}\nPage: ${await page.locator("body").innerText()}`,
            );
        });
    await page.locator("#new-page-path").fill("/smoke-page");
    await Promise.all([
        page.waitForURL(/\/admin\/pages\?ulvia-official-page-id=/u),
        page.locator('form[cms-mutation^="ulvia.cms.pages:create "] button[type="submit"]').click(),
    ]);
    await page
        .locator("#page-general")
        .getByRole("heading", { name: "Smoke Page", exact: true })
        .waitFor()
        .catch(async (error) => {
            throw new Error(
                `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}\nPage: ${await page.locator("body").innerText()}`,
            );
        });
    await page.locator("#page-description").fill("Updated before editing the document.");
    const detailsResponse = await submitPageDetails(page);
    if (!detailsResponse.ok()) {
        throw new Error(`Page details update failed (${detailsResponse.status()}).`);
    }
    await page.locator('a[href="#page-content"]').click();
    await page.waitForURL(/#page-content$/u);
    const addHeading = page.getByRole("button", { name: "Add Heading", exact: true });
    await addHeading.waitFor();
    await waitUntilEnabled(addHeading, "Page editor did not become ready");
    const editorError = page.locator("ulvia-official-page-editor [data-notice][data-error]");
    if (await editorError.isVisible().catch(() => false)) {
        throw new Error(`Page editor failed to load at ${page.url()}: ${await editorError.textContent()}`);
    }
    await addHeading.click();
    await fillLatestVisibleElementContent(page, "Smoke Page");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await fillLatestVisibleElementContent(page, "Published through the Kernel.");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await fillLatestVisibleElementContent(page, "Built with the visual Page editor.");
    const saveResponse = await submitPageMutation(page, "update");
    if (!saveResponse.ok()) {
        throw new Error(`Page update failed (${saveResponse.status()}).`);
    }
    await page.locator('a[href="#page-publication"]').click();
    await page.waitForURL(/#page-publication$/u);
    const publishResponse = await submitPageMutation(page, "publish");
    if (!publishResponse.ok()) {
        throw new Error(`Page publication failed (${publishResponse.status()}).`);
    }
    await verifyPublishedPage(page, kernelOrigin);
    await page.goto(`${kernelOrigin}/admin/pages`);
    await page.locator("#pages-list").waitFor();
}

async function fillLatestVisibleElementContent(page: Page, value: string): Promise<void> {
    const fields = page.getByLabel("Element content", { exact: true });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        for (let index = (await fields.count()) - 1; index >= 0; index -= 1) {
            const field = fields.nth(index);
            if (await field.isVisible().catch(() => false)) {
                await field.fill(value);
                return;
            }
        }
        await page.waitForTimeout(50);
    }
    throw new Error("The Page editor did not expose a visible element content field");
}

async function submitPageDetails(page: Page) {
    const form = page.locator('form[cms-mutation="ulvia.cms.pages:update as saved"]');
    const revision = form.locator('input[name="expectedRevision"]');
    const initialRevision = await revision.inputValue();
    const reload = page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/get"));
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/update")),
        form.locator('button[type="submit"]').click(),
    ]);
    if (response.ok()) {
        await reload;
        await waitForRevisionChange(revision, initialRevision);
    }
    return response;
}

async function waitUntilEnabled(locator: ReturnType<Page["locator"]>, message: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (!(await locator.isEnabled().catch(() => false)) && Date.now() < deadline) {
        await locator.page().waitForTimeout(25);
    }
    if (!(await locator.isEnabled().catch(() => false))) {
        throw new Error(message);
    }
}

async function waitForRevisionChange(revision: ReturnType<Page["locator"]>, initialRevision: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if ((await revision.inputValue().catch(() => initialRevision)) !== initialRevision) {
            return;
        }
        await revision.page().waitForTimeout(25);
    }
    throw new Error("Page details did not expose the updated revision after reload");
}

export async function verifyPublishedPage(page: Page, kernelOrigin: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    let status = 0;
    let responseBody = "";
    let responseHeaders: Record<string, string> = {};
    while (Date.now() < deadline) {
        const response = await page.goto(`${kernelOrigin}/smoke-page`);
        status = response?.status() ?? 0;
        responseHeaders = response?.headers() ?? {};
        responseBody = (await response?.text().catch(() => "")) ?? "";
        const visible = await Promise.all([
            page
                .getByRole("heading", { name: "Smoke Page", exact: true })
                .isVisible()
                .catch(() => false),
            page
                .getByText("Published through the Kernel.", { exact: true })
                .isVisible()
                .catch(() => false),
            page
                .getByText("Built with the visual Page editor.", { exact: true })
                .isVisible()
                .catch(() => false),
        ]);
        if (response?.ok() && visible.every(Boolean)) {
            return;
        }
        await page.waitForTimeout(250);
    }
    throw new Error(
        `Published Page unavailable (${status}). Headers: ${JSON.stringify(responseHeaders)}. ` +
            `Response: ${responseBody.slice(0, 2_000)}. Page: ${await page.locator("body").innerText()}`,
    );
}

async function submitPageMutation(page: Page, capability: string) {
    const responses: string[] = [];
    const recordResponse = (response: { url(): string }) => responses.push(response.url());
    page.on("response", recordResponse);
    try {
        const reload = page
            .waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/get"))
            .catch(() => null);
        const [response] = await Promise.all([
            page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.pages/${capability}`)),
            mutationButton(page, capability).click(),
        ]);
        if (response.ok()) {
            const reloaded = await reload;
            if (!reloaded) {
                throw new Error("Page details did not reload after the mutation");
            }
        }
        return response;
    } catch (error) {
        throw new Error(
            `${capability} did not complete: ${error instanceof Error ? error.message : String(error)}. ` +
                `Observed responses: ${responses.join(", ") || "none"}.`,
        );
    } finally {
        page.off("response", recordResponse);
    }
}

function mutationButton(page: Page, capability: string) {
    if (capability === "update") {
        return page.getByRole("button", { name: "Save document", exact: true });
    }
    const mutationForm = page
        .locator(`form[cms-mutation^="ulvia.cms.pages:${capability} "]`)
        .filter({ has: page.locator('input[name="visible"][value="true"]') });
    return mutationForm.locator('button[type="submit"]');
}
