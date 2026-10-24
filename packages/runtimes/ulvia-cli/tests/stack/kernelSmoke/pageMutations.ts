import type { Page } from "playwright";

export async function submitRevisionMutation(
    page: Page,
    form: ReturnType<Page["locator"]>,
    capability: string,
): Promise<void> {
    const revision = form.locator('input[name="expectedRevision"]');
    const initialRevision = await revision.inputValue();
    const reload = page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.content/pages.get"));
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.content/pages.${capability}`)),
        form.locator('button[type="submit"]').click(),
    ]);
    if (!response.ok()) {
        throw new Error(`${capability} failed (${response.status()}): ${await response.text()}`);
    }
    await reload;
    await waitForRevisionChange(revision, initialRevision);
}

export async function submitPageMutation(page: Page, capability: string, visible = true) {
    const responses: string[] = [];
    const recordResponse = (response: { url(): string }) => responses.push(response.url());
    page.on("response", recordResponse);
    try {
        const reload = page
            .waitForResponse((candidate) => candidate.url().includes("ulvia.cms.content/pages.get"))
            .catch(() => null);
        const [response] = await Promise.all([
            page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.content/pages.${capability}`)),
            mutationButton(page, capability, visible).click(),
        ]);
        if (response.ok() && !(await reload)) {
            throw new Error("Page details did not reload after the mutation");
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

export async function waitForRevisionChange(
    revision: ReturnType<Page["locator"]>,
    initialRevision: string,
): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if ((await revision.inputValue().catch(() => initialRevision)) !== initialRevision) {
            return;
        }
        await revision.page().waitForTimeout(25);
    }
    throw new Error("Page details did not expose the updated revision after reload");
}

function mutationButton(page: Page, capability: string, visible: boolean) {
    if (capability === "update") {
        return page.locator("#page-editor-save");
    }
    return page
        .locator(`form[cms-mutation^="ulvia.cms.content:pages.${capability} "]`)
        .filter({ has: page.locator(`input[name="visible"][value="${visible}"]`) })
        .locator('button[type="submit"]');
}
