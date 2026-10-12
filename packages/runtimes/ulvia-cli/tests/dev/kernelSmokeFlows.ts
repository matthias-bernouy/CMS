import type { Page } from "playwright";
import { mutatePages, verifyPublishedPage } from "./kernelSmokePages";

export async function runKernelSmoke(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await signIn(page, credentials, kernelOrigin);
    await mutatePages(page, kernelOrigin);
    await mutateCollections(page);
    await mutateSettings(page);
    await mutateProviders(page);
    await mutateAccess(page);
    await inspectDiagnostics(page);
}

export async function verifyKernelStateAfterRestart(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await signIn(page, credentials, kernelOrigin);
    await page.getByText("Smoke Page", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Collections", exact: true }).click();
    await page.getByRole("heading", { name: "smoke-kit", exact: true }).waitFor();

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await waitUntilEnabled(page, "Save general settings");
    await expectAdminValue(page, "Site name", "Smoke CMS");
    await page.getByRole("button", { name: "Languages", exact: true }).click();
    await expectAdminValue(page, "Default language", "fr-FR");

    await page.getByRole("link", { name: "Providers", exact: true }).click();
    await page.getByRole("heading", { name: "Installations and contract routing" }).waitFor();
    await page.getByRole("button", { name: "Contract routing" }).click();
    await page.getByText("Contract implementations loaded.", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Users", exact: true }).click();
    await page.getByText("1 total users.", { exact: true }).waitFor();

    await inspectDiagnostics(page);
    await verifyPublishedPage(page, kernelOrigin);
}

async function signIn(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await page.goto(`${kernelOrigin}/login`);
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await page.getByLabel("Email address").fill(credentials.adminEmail);
    await page.getByLabel("Password").fill(credentials.adminPassword);
    await Promise.all([page.waitForURL(/\/admin$/u), page.getByRole("button", { name: /Sign in with/u }).click()]);
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
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
    await page.getByRole("button", { name: "Languages", exact: true }).click();
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
