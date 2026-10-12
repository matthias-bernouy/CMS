import type { Page } from "playwright";

export async function mutatePages(page: Page, kernelOrigin: string): Promise<void> {
    await page.getByLabel("Title", { exact: true }).fill("Smoke Page");
    await page.getByLabel("Public path").fill("/smoke-page");
    await Promise.all([
        page.waitForURL(/\/admin\/pages\?id=/u),
        page.getByRole("button", { name: "Create Page" }).click(),
    ]);
    await page
        .getByRole("heading", { name: "Smoke Page" })
        .waitFor()
        .catch(async (error) => {
            throw new Error(
                `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}\nPage: ${await page.locator("body").innerText()}`,
            );
        });
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Smoke Page");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Published through the Kernel.");
    await page.getByRole("button", { name: "Add Heading", exact: true }).click();
    await page.getByLabel("Element content", { exact: true }).fill("Built with the visual Page editor.");
    const saveResponse = await submitPageMutation(page, "update", "Save document");
    if (!saveResponse.ok()) {
        throw new Error(`Page update failed (${saveResponse.status()}).`);
    }
    const publishResponse = await submitPageMutation(page, "publish", "Publish");
    if (!publishResponse.ok()) {
        throw new Error(`Page publication failed (${publishResponse.status()}).`);
    }
    await verifyPublishedPage(page, kernelOrigin);
    await page.goto(`${kernelOrigin}/admin`);
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
}

export async function verifyPublishedPage(page: Page, kernelOrigin: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    let status = 0;
    while (Date.now() < deadline) {
        const response = await page.goto(`${kernelOrigin}/smoke-page`);
        status = response?.status() ?? 0;
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
    throw new Error(`Published Page unavailable (${status}). Page: ${await page.locator("body").innerText()}`);
}

async function submitPageMutation(page: Page, capability: string, buttonName: string) {
    const responses: string[] = [];
    const recordResponse = (response: { url(): string }) => responses.push(response.url());
    page.on("response", recordResponse);
    try {
        const reload = page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.pages/get"));
        const [response] = await Promise.all([
            page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.pages/${capability}`)),
            page.getByRole("button", { name: buttonName, exact: true }).click(),
        ]);
        if (response.ok()) {
            await reload;
        }
        return response;
    } catch (error) {
        throw new Error(
            `${buttonName} did not complete: ${error instanceof Error ? error.message : String(error)}. ` +
                `Observed responses: ${responses.join(", ") || "none"}.`,
        );
    } finally {
        page.off("response", recordResponse);
    }
}
