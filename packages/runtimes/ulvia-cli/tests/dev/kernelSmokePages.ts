import type { Page } from "playwright";

export async function mutatePages(page: Page, kernelOrigin: string): Promise<void> {
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
        page.waitForURL(/\/admin\/pages\?id=/u),
        page.locator('form[cms-source*="ulvia.cms.pages/create"] button[type="submit"]').click(),
    ]);
    await page
        .getByRole("heading", { name: "Smoke Page" })
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
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Smoke Page");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Published through the Kernel.");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Built with the visual Page editor.");
    const saveResponse = await submitPageMutation(page, "update");
    if (!saveResponse.ok()) {
        throw new Error(`Page update failed (${saveResponse.status()}).`);
    }
    const publishResponse = await submitPageMutation(page, "publish");
    if (!publishResponse.ok()) {
        throw new Error(`Page publication failed (${publishResponse.status()}).`);
    }
    await verifyPublishedPage(page, kernelOrigin);
    await page.goto(`${kernelOrigin}/admin`);
    await page.locator("#pages-list").waitFor();
}

async function submitPageDetails(page: Page) {
    const form = page.locator('form[cms-source*="ulvia.cms.pages/update as saved"]');
    const reload = page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/get"));
    const editorReload = page.waitForResponse((candidate) =>
        candidate.url().includes("ulvia.cms.pages/editor-catalogue"),
    );
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/update")),
        form.locator('button[type="submit"]').click(),
    ]);
    if (response.ok()) {
        await Promise.all([reload, editorReload]);
        const addHeading = page.getByRole("button", { name: "Add Heading", exact: true });
        await addHeading.waitFor();
        const deadline = Date.now() + 15_000;
        while (!(await addHeading.isEnabled()) && Date.now() < deadline) {
            await page.waitForTimeout(25);
        }
        if (!(await addHeading.isEnabled())) {
            throw new Error("Page editor did not become ready after the details reload");
        }
    }
    return response;
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
        .locator(`form[cms-source^="/.cms/call/ulvia.cms.pages/${capability} "]`)
        .filter({ has: page.locator('input[name="visible"][value="true"]') });
    return mutationForm.locator('button[type="submit"]');
}
