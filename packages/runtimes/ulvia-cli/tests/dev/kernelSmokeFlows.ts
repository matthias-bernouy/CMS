import type { Page } from "playwright";
import { mutatePages, verifyPublishedPage } from "./kernelSmokePages";
import { mutateFiles, verifyFilesAfterRestart } from "./kernelSmokeFiles";

export async function runKernelSmoke(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await stage("sign in", () => signIn(page, credentials, kernelOrigin));
    await stage("Pages", () => mutatePages(page, kernelOrigin));
    await stage("files", () => mutateFiles(page));
    await stage("collections and theme", () => mutateCollections(page));
    await stage("settings", () => mutateSettings(page));
    await stage("provider routing", () => mutateProviders(page));
    await stage("access", () => mutateAccess(page));
    await stage("diagnostics", () => inspectDiagnostics(page));
}

async function stage(name: string, operation: () => Promise<void>): Promise<void> {
    try {
        await operation();
    } catch (error) {
        throw new Error(
            `Kernel smoke failed during ${name}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

export async function verifyKernelStateAfterRestart(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await signIn(page, credentials, kernelOrigin);
    await page.getByText("Smoke Page", { exact: true }).waitFor();
    await stage("persisted files", () => verifyFilesAfterRestart(page));

    await adminPageLink(page, "collections").click();
    await page.getByRole("heading", { name: "smoke-kit", exact: true }).waitFor();

    await adminPageLink(page, "settings").click();
    await waitUntilEnabled(page, "Save general settings");
    await expectAdminValue(page, "Site name", "Smoke CMS");
    await expectAdminValue(page, "Default language", "fr-FR");

    await adminPageLink(page, "providers").click();
    await page.getByRole("heading", { name: "Providers & contracts", exact: true }).first().waitFor();
    await page.getByRole("heading", { name: "Contract routing", exact: true }).waitFor();

    await adminPageLink(page, "access").click();
    await page.getByText(credentials.adminEmail, { exact: true }).waitFor();

    await inspectDiagnostics(page);
    await verifyPublishedPage(page, kernelOrigin);
}

async function signIn(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await page.goto(`${kernelOrigin}/login`);
    await page.getByRole("heading", { name: /^(Welcome back|Bon retour)$/u }).waitFor();
    await page.getByLabel(/^(Email address|Adresse e-mail)$/u).fill(credentials.adminEmail);
    await page.getByLabel(/^(Password|Mot de passe)$/u).fill(credentials.adminPassword);
    await Promise.all([
        page.waitForURL(/\/admin$/u),
        page.getByRole("button", { name: /^(Sign in|Se connecter)$/u }).click(),
    ]);
    await page
        .getByRole("heading", { name: "Dashboard", exact: true })
        .waitFor()
        .catch(async (error) => {
            throw new Error(
                `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}\nPage: ${await page.locator("body").innerText()}`,
            );
        });
    await adminPageLink(page, "pages").click();
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
}

async function mutateCollections(page: Page): Promise<void> {
    await adminPageLink(page, "collections").click();
    await page.getByRole("heading", { name: "Installed collections", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    const installResponse = page.waitForResponse((candidate) =>
        candidate.url().includes("ulvia.cms.collections/install"),
    );
    await page.getByRole("button", { name: "Install", exact: true }).click();
    if (!(await installResponse).ok()) {
        throw new Error("Collection installation failed.");
    }
    const smokeCard = page.getByRole("heading", { name: "smoke-kit", exact: true }).locator("..");
    await smokeCard.getByRole("button", { name: "Manage" }).click();
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    await page.getByText("smoke-kit-card", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Back to Collections", exact: true }).click();
    const officialCard = page.getByRole("heading", { name: "ulvia-official", exact: true }).locator("..");
    await officialCard.getByRole("button", { name: "Manage" }).click();
    await page.getByRole("heading", { name: "Ulvia Official", exact: true }).waitFor();
    await page.getByLabel("Search tokens").waitFor();
    const themeValue = page.getByLabel("Light value");
    await themeValue.fill(await themeValue.inputValue());
    await page.getByRole("button", { name: "Save value", exact: true }).click();
    await page.getByText("Theme value saved.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Back to Collections", exact: true }).click();
}

async function mutateSettings(page: Page): Promise<void> {
    await adminPageLink(page, "settings").click();
    await waitUntilEnabled(page, "Save general settings");
    await page.getByRole("heading", { name: "General", exact: true }).waitFor();
    await page.getByLabel("Site name").fill("Smoke CMS");
    const [generalResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.access/update-site")),
        page.getByRole("button", { name: "Save general settings" }).click(),
    ]);
    if (!generalResponse.ok()) {
        throw new Error(`General settings flow failed (${generalResponse.status()}): ${await generalResponse.text()}`);
    }
    await page.getByText("General settings saved.", { exact: true }).waitFor();
    await page.getByLabel("Default language").fill("fr-FR");
    const [languagesResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.localization/update-languages")),
        page.getByRole("button", { name: "Save languages" }).click(),
    ]);
    if (!languagesResponse.ok()) {
        throw new Error(
            `Language settings flow failed (${languagesResponse.status()}): ${await languagesResponse.text()}`,
        );
    }
    await page.getByText("Languages saved.", { exact: true }).waitFor();
}

async function mutateProviders(page: Page): Promise<void> {
    await adminPageLink(page, "providers").click();
    await page.getByRole("heading", { name: "Providers & contracts", exact: true }).first().waitFor();
    await page.getByRole("heading", { name: "Contract routing", exact: true }).waitFor();
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.providers/replace-selections")),
        page.getByRole("button", { name: "Save contract routing" }).click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Contract routing flow failed (${response.status()}).`);
    }
}

async function mutateAccess(page: Page): Promise<void> {
    await adminPageLink(page, "access").click();
    const providerForm = page.locator('form[cms-mutation^="ulvia.cms.access:update-login-provider "]').first();
    await providerForm.getByText("Email & password").waitFor();
    await providerForm.locator('select[name="enabled"]').selectOption("true");
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.access/update-login-provider")),
        providerForm.locator('button[type="submit"]').click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Login provider flow failed (${response.status()}).`);
    }
}

async function inspectDiagnostics(page: Page): Promise<void> {
    await adminPageLink(page, "diagnostics").click();
    await page.getByRole("heading", { name: "Diagnostics", exact: true }).waitFor();
    await page.locator("#migration-health").waitFor();
    await page
        .locator('section[cms-query*="ulvia.cms.jobs:list"] p[cms-condition*="jobs.data.items.length"]')
        .waitFor();
}

async function expectAdminValue(page: Page, label: string, expected: string): Promise<void> {
    const actual = await page.getByLabel(label).inputValue();
    if (actual !== expected) {
        throw new Error(`${label} did not survive restart (expected ${expected}, received ${actual}).`);
    }
}

async function waitUntilEnabled(page: Page, buttonName: string): Promise<void> {
    const button = page.getByRole("button", { name: buttonName, exact: true });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (await button.isEnabled().catch(() => false)) {
            return;
        }
        await page.waitForTimeout(100);
    }
    throw new Error(`${buttonName} did not become enabled.`);
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}
