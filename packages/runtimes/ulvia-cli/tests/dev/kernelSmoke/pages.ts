import type { Page } from "playwright";
import { cyclePublicationState, mutateRoute, mutateSeo } from "./pageLifecycle";
import { submitPageMutation, waitForRevisionChange } from "./pageMutations";

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
    const detailUrl = page.url();
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
    await mutateRoute(page);
    await mutateSeo(page);
    await page.locator('a[href="#page-content"]').click();
    await page.waitForURL(/#page-content$/u);
    const addHeading = page.getByRole("button", { name: "Add Heading", exact: true });
    await addHeading.waitFor();
    await waitUntilEnabled(addHeading, "Page editor did not become ready");
    const editorError = page.locator('[cms-bloc="ulvia-official-page-editor"] [data-notice][data-error]');
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
    await cyclePublicationState(page, kernelOrigin, detailUrl);
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
