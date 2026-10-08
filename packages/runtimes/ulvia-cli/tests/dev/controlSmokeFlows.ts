import type { Page } from "playwright";

export async function runControlSmoke(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    controlOrigin: string,
): Promise<void> {
    await signIn(page, credentials, controlOrigin);
    await mutatePages(page);
    await mutateCollections(page);
    await mutateSettings(page);
    await mutateProviders(page);
    await mutateAccess(page);
    await inspectDiagnostics(page);
}

export async function verifyControlStateAfterRestart(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    controlOrigin: string,
): Promise<void> {
    await signIn(page, credentials, controlOrigin);
    await page.getByText("Smoke Page", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Collections", exact: true }).click();
    await page.getByRole("heading", { name: "smoke-kit", exact: true }).waitFor();

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expectControlValue(page, "Site name", "Smoke CMS");
    await page.getByRole("button", { name: "Languages", exact: true }).click();
    await expectControlValue(page, "Default language", "fr-FR");

    await page.getByRole("link", { name: "Providers", exact: true }).click();
    await page.getByRole("heading", { name: "Installations and contract routing" }).waitFor();
    await page.getByRole("button", { name: "Contract routing" }).click();
    await page.getByText("Contract implementations loaded.", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.getByText("1 total users.", { exact: true }).waitFor();

    await inspectDiagnostics(page);
}

async function signIn(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    controlOrigin: string,
): Promise<void> {
    await page.goto(`${controlOrigin}/login`);
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await page.getByLabel("Email address").fill(credentials.adminEmail);
    await page.getByLabel("Password").fill(credentials.adminPassword);
    await Promise.all([page.waitForURL(/\/admin$/u), page.getByRole("button", { name: /Sign in with/u }).click()]);
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
}

async function mutatePages(page: Page): Promise<void> {
    await page.getByLabel("Title", { exact: true }).fill("Smoke Page");
    await page.getByLabel("Public path").fill("/smoke-page");
    await Promise.all([
        page.waitForURL(/\/admin\/pages\?id=/u),
        page.getByRole("button", { name: "Create Page" }).click(),
    ]);
    await page.getByRole("heading", { name: "Smoke Page" }).waitFor();
}

async function mutateCollections(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Collections", exact: true }).click();
    await page.getByRole("heading", { name: "Installed foundations and releases" }).waitFor();
    await page.getByRole("button", { name: "Repository", exact: true }).click();
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    await page.getByRole("button", { name: "Install", exact: true }).click();
    await page.getByText("Collection installed.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Installed", exact: true }).click();
    const smokeCard = page.getByRole("heading", { name: "smoke-kit", exact: true }).locator("..");
    await smokeCard.getByRole("button", { name: "Manage" }).click();
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    await page.getByRole("button", { name: /Blocs/u }).click();
    await page.getByText("smoke-kit-card", { exact: true }).waitFor();
    await page.getByRole("button", { name: /Collections/u }).click();
}

async function mutateSettings(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("heading", { name: "General", exact: true }).waitFor();
    await page.getByLabel("Site name").fill("Smoke CMS");
    await page.getByRole("button", { name: "Save general settings" }).click();
    await page.getByText("General settings saved.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Languages", exact: true }).click();
    await page.getByLabel("Default language").fill("fr-FR");
    await page.getByRole("button", { name: "Save languages" }).click();
    await page.getByText("Languages saved.", { exact: true }).waitFor();
}

async function mutateProviders(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Providers", exact: true }).click();
    await page.getByRole("heading", { name: "Installations and contract routing" }).waitFor();
    await page.getByRole("button", { name: "Contract routing" }).click();
    await page.getByText("Contract implementations loaded.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Save contract routing" }).click();
    await page.getByText("Contract routing saved.", { exact: true }).waitFor();
}

async function mutateAccess(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.getByText("1 total users.", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "Members", exact: true }).waitFor();
    await page.getByLabel("Provider status").first().selectOption("true");
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.access/update-login-provider")),
        page.getByRole("button", { name: "Save provider" }).first().click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Login provider flow failed (${response.status()}).`);
    }
}

async function inspectDiagnostics(page: Page): Promise<void> {
    await page.getByRole("link", { name: "Diagnostics", exact: true }).click();
    await page.getByRole("heading", { name: "Diagnostics", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Content maintenance", exact: true }).waitFor();
}

async function expectControlValue(page: Page, label: string, expected: string): Promise<void> {
    const actual = await page.getByLabel(label).inputValue();
    if (actual !== expected) {
        throw new Error(`${label} did not survive restart (expected ${expected}, received ${actual}).`);
    }
}
