import type { Page } from "playwright";
import { submitPageMutation, submitRevisionMutation } from "./pageMutations";

export async function mutateRoute(page: Page): Promise<void> {
    await page.locator('a[href="#page-routes"]').click();
    await page.waitForURL(/#page-routes$/u);
    const form = page.locator('form[cms-mutation^="ulvia.cms.pages:update-route "]').first();
    await form.waitFor();
    const path = form.locator('input[name="path"]');
    await path.fill(await path.inputValue());
    await submitRevisionMutation(page, form, "update-route");
}

export async function mutateSeo(page: Page): Promise<void> {
    await page.locator('a[href="#page-search"]').click();
    await page.waitForURL(/#page-search$/u);
    const form = page.locator('form[cms-mutation^="ulvia.cms.pages:update-seo "]').first();
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
    const draftPage = await page.goto(`${kernelOrigin}/smoke-page`);
    if (draftPage?.ok()) {
        throw new Error("Draft Page remained publicly available");
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
    const card = page.locator('#pages-list [role="listitem"]').filter({ hasText: "Smoke Page" });
    await card.locator('a[href*="ulvia-official-page-id"]').click();
    await page.locator("#page-general").waitFor();
    await page.locator('a[href="#page-danger"]').click();
    await page.waitForURL(/#page-danger$/u);
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/delete")),
        page.locator('form[cms-mutation^="ulvia.cms.pages:delete "] button[type="submit"]').click(),
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
