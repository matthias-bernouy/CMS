import type { Page } from "playwright";
import { inspectDiagnostics, mutateSettings, verifyAdministrationAfterRestart } from "./administration";
import { exerciseCollectionUpgrades } from "./collectionUpgrades";
import { mutateFiles, verifyFilesAfterRestart } from "./files";
import { deleteSmokePage, verifyPublishedPage } from "./pageLifecycle";
import { mutatePages } from "./pages";
import { mutateAccess, mutateProviders } from "./providerAccess";

export async function runKernelSmoke(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await stage("sign in", () => signIn(page, credentials, kernelOrigin));
    await stage("admin routes", () => inspectAdminRoutes(page, kernelOrigin));
    await stage("Pages", () => mutatePages(page, kernelOrigin));
    await stage("files", () => mutateFiles(page));
    await stage("collections and theme", () => mutateCollections(page));
    await stage("settings", () => mutateSettings(page));
    await stage("provider routing", () => mutateProviders(page));
    await stage("access", () => mutateAccess(page, credentials.adminEmail));
    await stage("diagnostics", () => inspectDiagnostics(page));
}

export async function verifyKernelStateAfterRestart(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    kernelOrigin: string,
): Promise<void> {
    await signIn(page, credentials, kernelOrigin);
    await page.getByText("Smoke Page", { exact: true }).waitFor();
    await stage("persisted files", () => verifyFilesAfterRestart(page));
    await stage("persisted collection", () => verifyCollectionAfterRestart(page));
    await stage("persisted administration", () => verifyAdministrationAfterRestart(page, credentials));
    await verifyPublishedPage(page, kernelOrigin);
    await stage("Page deletion", () => deleteSmokePage(page, kernelOrigin));
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
    await page.getByRole("heading", { name: /^(Dashboard|Tableau de bord)$/u }).waitFor();
    await adminPageLink(page, "pages").click();
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
}

async function inspectAdminRoutes(page: Page, kernelOrigin: string): Promise<void> {
    for (const path of [
        "/admin",
        "/admin/pages",
        "/admin/files",
        "/admin/collections",
        "/admin/providers",
        "/admin/access",
        "/admin/settings",
        "/admin/diagnostics",
    ]) {
        const response = await page.goto(`${kernelOrigin}${path}`, { waitUntil: "domcontentloaded" });
        if (!response?.ok()) {
            throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
        }
        await page.locator("h1").first().waitFor();
        if (
            await page
                .getByText("Internal server error", { exact: true })
                .isVisible()
                .catch(() => false)
        ) {
            throw new Error(`${path} rendered an internal server error`);
        }
    }
    await page.goto(`${kernelOrigin}/admin/pages`);
    await page.locator("#pages-list").waitFor();
}

async function mutateCollections(page: Page): Promise<void> {
    await adminPageLink(page, "collections").click();
    await page.locator("#installed-collections").waitFor();
    await page.locator('a[href="#repository-releases"]').click();
    await page.waitForURL(/#repository-releases$/u);
    const initialRelease = collectionReleaseCard(page, "ulvia.test 1.0.0");
    await initialRelease.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    const installResponse = page.waitForResponse((candidate) =>
        candidate.url().includes("ulvia.cms.collections/install"),
    );
    await initialRelease.getByRole("button", { name: /^(Install|Installer)$/u }).click();
    if (!(await installResponse).ok()) {
        throw new Error("Collection installation failed.");
    }
    await page.locator('a[href="#installed-collections"]').click();
    await page.waitForURL(/#installed-collections$/u);
    const smokeCard = page.getByRole("heading", { name: "smoke-kit", exact: true }).locator("..");
    await smokeCard.getByRole("link", { name: /^(Manage|Gérer)$/u }).click();
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    await page.locator('a[href="#collection-blocks"]').click();
    await page.waitForURL(/#collection-blocks$/u);
    await page.getByText("smoke-kit-card", { exact: true }).waitFor();
    await page.getByRole("link", { name: /^(Back to Collections|Retour aux Collections)$/u }).click();
    await exerciseCollectionUpgrades(page);
    const officialCard = page.getByRole("heading", { name: "ulvia-official", exact: true }).locator("..");
    await officialCard.getByRole("link", { name: /^(Manage|Gérer)$/u }).click();
    await page.getByRole("heading", { name: "Ulvia Official", exact: true }).waitFor();
    await page.locator('a[href="#collection-theme"]').click();
    await page.locator("#collection-theme-search").waitFor();
    await page
        .getByRole("link", { name: /^(Edit token|Modifier le token)$/u })
        .first()
        .click();
    const themeValue = page.locator("#collection-theme-token-value");
    await themeValue.waitFor();
    await themeValue.fill(await themeValue.inputValue());
    await page.locator('form[cms-mutation^="ulvia.cms.theme:save-token "] button[type="submit"]').click();
    await page
        .locator(
            'form[cms-mutation^="ulvia.cms.theme:save-token "] p[cms-condition*="savedThemeToken.outcome.kind === \'success\'"]',
        )
        .waitFor();
    const resetTheme = page.locator('form[cms-mutation^="ulvia.cms.theme:reset-token "]');
    await resetTheme.waitFor();
    const [resetResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.theme/reset-token")),
        resetTheme.locator('button[type="submit"]').click(),
    ]);
    if (!resetResponse.ok()) {
        throw new Error(`Theme reset flow failed (${resetResponse.status()}).`);
    }
    await page.locator('a[href="#collection-texts"]').click();
    await page.waitForURL(/#collection-texts$/u);
    const textForm = page.locator('form[cms-mutation^="ulvia.cms.localization:save-text "]').first();
    await textForm.waitFor();
    const textValue = textForm.locator('textarea[name="value"]');
    await textValue.fill(await textValue.inputValue());
    const [textResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.localization/save-text")),
        textForm.locator('button[type="submit"]').click(),
    ]);
    if (!textResponse.ok()) {
        throw new Error(`Collection text flow failed (${textResponse.status()}).`);
    }
    await page.getByRole("link", { name: /^(Back to Collections|Retour aux Collections)$/u }).click();
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}

async function verifyCollectionAfterRestart(page: Page): Promise<void> {
    await adminPageLink(page, "collections").click();
    await page.getByRole("heading", { name: "smoke-kit", exact: true }).waitFor();
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}
