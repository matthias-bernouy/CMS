import type { Page } from "playwright";
import { submitPageMutation, submitRevisionMutation } from "./pageMutations";

export async function verifyPageDetailTabs(page: Page): Promise<void> {
    const panelIds = ["page-general", "page-routes", "page-search", "page-publication", "page-danger"];
    await page.locator('[role="tablist"]').waitFor();
    for (const [index, id] of panelIds.entries()) {
        const panel = page.locator(`#${id}`);
        await panel.waitFor({ state: index === 0 ? "visible" : "attached" });
        if ((await panel.getAttribute("hidden")) !== (index === 0 ? null : "")) {
            throw new Error(`Page detail panel ${id} has an invalid initial visibility state.`);
        }
    }
    const selected = page.locator('[role="tab"][aria-selected="true"]');
    if ((await selected.getAttribute("href")) !== "#page-general") {
        throw new Error("Page detail tabs did not select the general panel by default.");
    }
}

export async function mutateRoute(page: Page): Promise<void> {
    await page.locator('a[href="#page-routes"]').click();
    await page.waitForURL(/#page-routes$/u);
    const form = page.locator('form[cms-mutation^="ulvia.cms.content:pages.update-route "]').first();
    await form.waitFor();
    const path = form.locator('input[name="path"]');
    await path.fill(await path.inputValue());
    await submitRevisionMutation(page, form, "update-route");
}

export async function mutateSeo(page: Page): Promise<void> {
    await page.locator('a[href="#page-search"]').click();
    await page.waitForURL(/#page-search$/u);
    const form = page.locator('form[cms-mutation^="ulvia.cms.content:pages.update-seo "]').first();
    await form.waitFor();
    await form.locator('input[name="title"]').fill("Smoke Page SEO");
    await form.locator('textarea[name="description"]').fill("Smoke Page search description.");
    await submitRevisionMutation(page, form, "update-seo");
}

export async function cyclePublicationState(page: Page, kernelOrigin: string, detailUrl: string): Promise<void> {
    await verifyPublishedPage(page, kernelOrigin);
    await page.goto(detailUrl);
    await page.locator("#page-general").waitFor();
    await page.locator('a[href="#page-publication"]').click();
    await page.waitForURL(/#page-publication$/u);
    const draftResponse = await submitPageMutation(page, "publish", false);
    if (!draftResponse.ok()) {
        throw new Error(`Page return-to-draft failed (${draftResponse.status()}).`);
    }
    const anonymousDraftResponse = await fetch(`${kernelOrigin}/smoke-page`, { redirect: "manual" });
    if (anonymousDraftResponse.ok) {
        throw new Error("Draft Page remained anonymously available");
    }
    await page.goto(detailUrl);
    await page.locator('a[href="#page-publication"]').click();
    await page.waitForURL(/#page-publication$/u);
    const republishResponse = await submitPageMutation(page, "publish");
    if (!republishResponse.ok()) {
        throw new Error(`Page republication failed (${republishResponse.status()}).`);
    }
    await verifyPublishedPage(page, kernelOrigin);
}

export async function deleteSmokePage(page: Page, kernelOrigin: string): Promise<void> {
    await page.goto(`${kernelOrigin}/admin/pages`);
    const detailLink = page
        .locator('#pages-list a[href^="/admin/pages/detail?ulvia-official-page-id="]')
        .filter({ hasText: "Smoke Page" });
    await detailLink.click();
    await page.locator("#page-general").waitFor();
    await page.locator('a[href="#page-danger"]').click();
    await page.waitForURL(/#page-danger$/u);
    await page.locator('button[command="show-modal"][commandfor="delete-page-dialog"]').click();
    const deleteDialog = page.locator("#delete-page-dialog");
    await deleteDialog.waitFor({ state: "visible" });
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.content/pages.delete")),
        deleteDialog.locator('form[cms-mutation^="ulvia.cms.content:pages.delete "] button[type="submit"]').click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Page deletion failed (${response.status()}).`);
    }
    await page.waitForURL(/\/admin\/pages$/u);
    const deletedPage = await page.goto(`${kernelOrigin}/smoke-page`);
    if (deletedPage?.ok()) {
        throw new Error("Deleted Page remained publicly available");
    }
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
        const headingVisible = await page
            .getByRole("heading", { name: "Smoke Page", exact: true })
            .isVisible()
            .catch(() => false);
        if (response?.ok() && headingVisible) {
            return;
        }
        await page.waitForTimeout(250);
    }
    throw new Error(
        `Published Page unavailable (${status}). Headers: ${JSON.stringify(responseHeaders)}. ` +
            `Response: ${responseBody.slice(0, 2_000)}. Page: ${await page.locator("body").innerText()}`,
    );
}
