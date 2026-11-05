import { expect } from "bun:test";
import type { Connection } from "../client";

export async function editorWarnings(
    connection: Connection,
    cmsUrl: string,
    administrator: { email: string; password: string },
) {
    const draft = await connection.call("ulvia/cms.content", "pages.create", {
        path: "/validation-editor",
        title: "Editor warning review",
        content: '<div cms-bloc="ulvia--mcp-kit--panel"></div>',
    });
    const page = await connection.browser.newPage();
    page.setDefaultTimeout(20_000);
    try {
        await page.goto(`${cmsUrl}/login`);
        await page.getByLabel(/^(Email address|Adresse e-mail)$/u).fill(administrator.email);
        await page.getByLabel(/^(Password|Mot de passe)$/u).fill(administrator.password);
        const [login] = await Promise.all([
            page.waitForResponse((response) =>
                response.url().includes("/.cms/mutation/ulvia/cms.access/login-password"),
            ),
            page.getByRole("button", { name: /^(Sign in|Se connecter)$/u }).click(),
        ]);
        expect(login.status()).toBe(200);
        await page.waitForURL(/\/admin$/u);
        await page.goto(`${cmsUrl}/admin/pages/edit?ulvia--mossa--page-id=${draft.id}`);
        await page.locator("#page-editor-open-catalogue").click();
        const heading = page.locator('button[data-add="ulvia--mossa--heading"]');
        await heading.waitFor();
        await heading.click();
        const input = page
            .locator("[data-content-fields] textarea[data-content-address]")
            .filter({ visible: true })
            .last();
        await input.fill("Editor diagnostics verified");
        const [response] = await Promise.all([
            page.waitForResponse((response) => response.url().includes("ulvia/cms.content/pages.update")),
            page.locator("#page-editor-save").click(),
        ]);
        expect(response.status()).toBe(200);
        const updated = await response.json();
        expect(updated.diagnostics).toContainEqual(
            expect.objectContaining({ code: "page.route_missing", severity: "warning" }),
        );
        const notice = page.locator('[cms-bloc="ulvia--mossa--page-editor"] [data-notice]').first();
        await notice.waitFor({ state: "visible" });
        expect(await notice.textContent()).toContain("/validation-target");
        expect(await notice.getAttribute("data-error")).toBeNull();
        await page.waitForTimeout(3200);
        expect(await notice.textContent()).toContain("/validation-target");
        const saved = await connection.call("ulvia/cms.content", "pages.get", { id: draft.id });
        expect(saved.revision).toBe(updated.revision);
        expect(saved.content).toContain("Editor diagnostics verified");
        expect(saved).not.toHaveProperty("diagnostics");
    } finally {
        await page.close();
    }
}
