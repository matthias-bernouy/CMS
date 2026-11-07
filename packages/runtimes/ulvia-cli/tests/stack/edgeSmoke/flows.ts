import { expect } from "bun:test";
import { inspectObservability } from "./administration/observability";
import type { Page } from "playwright";
import {
    inspectDiagnostics,
    inspectLightDomIsolation,
    inspectResponsiveAdministration,
    mutateSettings,
    verifyAdministrationAfterRestart,
} from "./administration/views";
import { exerciseCollectionUpgrades } from "./collectionUpgrades";
import { mutateFiles, verifyFilesAfterRestart } from "./files";
import { deleteSmokePage, verifyPublishedPage } from "./pageLifecycle";
import { mutatePages } from "./pages";
import { mutateAccess, mutateProviders } from "./providerAccess";

export async function runEdgeSmoke(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    edgeOrigin: string,
): Promise<void> {
    await stage("native initialization", async () => {
        await page.goto(`${edgeOrigin}/.cms/setup`);
        await page.getByLabel("Email address").fill(credentials.adminEmail);
        await page.getByLabel("Password", { exact: true }).fill(credentials.adminPassword);
        await page.getByRole("button", { name: "Continue", exact: false }).click();
        await page.getByRole("button", { name: "Use a starter", exact: false }).click();
        await page.getByRole("button", { name: /^Administration / }).click();
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Confirm and install", exact: false }).click();
        await page.getByRole("heading", { name: "Your workspace is ready." }).waitFor({ timeout: 120_000 });
    });
    await stage("sign in", () => signIn(page, credentials, edgeOrigin));
    await stage("admin routes", () => inspectAdminRoutes(page, edgeOrigin));
    await stage("responsive administration", () => inspectResponsiveAdministration(page, edgeOrigin));
    await stage("Light DOM isolation", () => inspectLightDomIsolation(page));
    await stage("Pages", () => mutatePages(page, edgeOrigin));
    await stage("files", () => mutateFiles(page));
    await stage("collections and theme", () => mutateCollections(page));
    await stage("settings", () => mutateSettings(page));
    await stage("provider routing", () => mutateProviders(page));
    await stage("access", () => mutateAccess(page, credentials.adminEmail));
    await stage("diagnostics", () => inspectDiagnostics(page));
    await stage("observability", () => inspectObservability(page, edgeOrigin));
}

export async function verifyEdgeStateAfterRestart(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    edgeOrigin: string,
): Promise<void> {
    await signIn(page, credentials, edgeOrigin);
    await page.getByText("Smoke Page", { exact: true }).waitFor();
    await stage("persisted files", () => verifyFilesAfterRestart(page));
    await stage("persisted collection", () => verifyCollectionAfterRestart(page));
    await stage("persisted administration", () => verifyAdministrationAfterRestart(page, credentials));
    await verifyPublishedPage(page, edgeOrigin);
    await stage("Page deletion", () => deleteSmokePage(page, edgeOrigin));
}

async function stage(name: string, operation: () => Promise<void>): Promise<void> {
    console.info(`[edge-smoke] ${name}`);
    try {
        await operation();
        console.info(`[edge-smoke] ${name}: done`);
    } catch (error) {
        throw new Error(`Edge smoke failed during ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function signIn(
    page: Page,
    credentials: { adminEmail: string; adminPassword: string },
    edgeOrigin: string,
): Promise<void> {
    await page.goto(`${edgeOrigin}/login`);
    await page.getByRole("heading", { name: /^(Welcome back|Bon retour)$/u }).waitFor();
    await page.getByLabel(/^(Email address|Adresse e-mail)$/u).fill(credentials.adminEmail);
    await page.getByLabel(/^(Password|Mot de passe)$/u).fill(credentials.adminPassword);
    const [response] = await Promise.all([
        page.waitForResponse((response) => response.url().includes("/.cms/mutation/ulvia/cms.access/login-password")),
        page.getByRole("button", { name: /^(Sign in|Se connecter)$/u }).click(),
    ]);
    if (!response.ok()) {
        throw new Error(`login capability returned ${response.status()}`);
    }
    const cookies = await page.context().cookies(edgeOrigin);
    if (!cookies.some((cookie) => cookie.name === "cms-session")) {
        const headers = await response.allHeaders();
        const signals = ["set-cookie", "x-ulvia-session-effect"].filter((name) => Object.hasOwn(headers, name));
        throw new Error(
            `login capability returned success without establishing the CMS session cookie (response signals: ${signals.join(", ") || "none"})`,
        );
    }
    await page.waitForURL(/\/admin$/u);
    await page.getByRole("heading", { name: /^(Dashboard|Tableau de bord)$/u }).waitFor();
    await adminPageLink(page, "pages").click({ noWaitAfter: true });
    await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();
}

async function inspectAdminRoutes(page: Page, edgeOrigin: string): Promise<void> {
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
        console.info(`[edge-smoke] admin route ${path}`);
        const response = await page.goto(`${edgeOrigin}${path}`, { timeout: 15_000, waitUntil: "domcontentloaded" });
        console.info(`[edge-smoke] admin route ${path}: response`);
        if (!response?.ok()) {
            throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
        }
        await page.locator("h1").first().waitFor({ state: "attached" });
        if (
            await page
                .getByText("Internal server error", { exact: true })
                .isVisible()
                .catch(() => false)
        ) {
            throw new Error(`${path} rendered an internal server error`);
        }
        console.info(`[edge-smoke] admin route ${path}: done`);
    }
    await page.goto(`${edgeOrigin}/admin/pages`);
    await page.locator("#pages-list").waitFor();
}

async function mutateCollections(page: Page): Promise<void> {
    await adminPageLink(page, "collections").click();
    await page.getByRole("heading", { name: /^(Explore collections|Explorer les Collections)$/u }).waitFor();
    const betaRelease = collectionReleaseCard(page, "ulvia.test 2.1.0-beta.1");
    expect(await betaRelease.count()).toBe(0);
    await page.getByRole("link", { name: /^(Beta|Bêta)$/u, exact: true }).click();
    await betaRelease.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    await page.getByRole("link", { name: "Stable", exact: true }).click();
    const latestRelease = collectionReleaseCard(page, "ulvia.test 2.0.0");
    await latestRelease.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor();
    expect(await collectionReleaseCard(page, "ulvia.test 1.0.0").count()).toBe(0);
    await latestRelease.getByRole("link", { name: /^(Release history|Historique des versions)$/u }).click();
    const initialRelease = page.locator("tbody tr").filter({ has: page.getByText("1.0.0", { exact: true }) });
    const installResponse = page.waitForResponse((candidate) =>
        candidate.url().includes("ulvia/cms.installations/install-collection"),
    );
    await initialRelease.getByRole("button", { name: /^(Install|Installer)$/u }).click();
    if (!(await installResponse).ok()) {
        throw new Error("Collection installation failed.");
    }
    await installedCollectionLink(page, "ulvia.test/smoke-kit").click({ noWaitAfter: true });
    await page.getByRole("heading", { name: "Smoke Kit", exact: true }).waitFor({ timeout: 60_000 });
    await page.locator('a[href="#collection-blocks"]').click();
    await page.waitForURL(/#collection-blocks$/u, { waitUntil: "domcontentloaded" });
    await page.getByText("ulvia-dtest--smoke-kit--card", { exact: true }).waitFor();
    await page.getByRole("link", { name: /^(Explore collections|Explorer les Collections)$/u }).click();
    await exerciseCollectionUpgrades(page);
    await installedCollectionLink(page, "ulvia/mossa").click({ noWaitAfter: true });
    await page.getByRole("heading", { name: "Mossa", exact: true }).waitFor({ timeout: 60_000 });
    await page.locator('a[href="#collection-examples"]').click();
    await page.locator("#collection-examples article").first().waitFor();
    await page.locator('a[href="#collection-theme"]').click();
    await page.locator("#collection-theme-search").waitFor();
    await page
        .getByRole("link", { name: /^(Edit token|Modifier le token)$/u })
        .first()
        .click();
    const themeValue = page.locator("#collection-theme-token-value");
    await themeValue.waitFor();
    await themeValue.fill(await themeValue.inputValue());
    await page.locator('form[cms-mutation^="ulvia/cms.content:theme.token.save "] button[type="submit"]').click();
    await page
        .locator(
            'form[cms-mutation^="ulvia/cms.content:theme.token.save "] p[cms-condition*="savedThemeToken.outcome.kind === \'success\'"]',
        )
        .waitFor();
    const resetTheme = page.locator('form[cms-mutation^="ulvia/cms.content:theme.token.reset "]');
    await resetTheme.waitFor();
    const [resetResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia/cms.content/theme.token.reset")),
        resetTheme.locator('button[type="submit"]').click(),
    ]);
    if (!resetResponse.ok()) {
        throw new Error(`Theme reset flow failed (${resetResponse.status()}).`);
    }
    await page.locator('a[href="#collection-texts"]').click();
    await page.waitForURL(/#collection-texts$/u, { waitUntil: "domcontentloaded" });
    const textForm = page.locator('form[cms-mutation^="ulvia/cms.content:localization.text.save "]').first();
    await textForm.waitFor();
    const textValue = textForm.locator('textarea[name="value"]');
    await textValue.fill(await textValue.inputValue());
    const [textResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia/cms.content/localization.text.save")),
        textForm.locator('button[type="submit"]').click(),
    ]);
    if (!textResponse.ok()) {
        throw new Error(`Collection text flow failed (${textResponse.status()}).`);
    }
    await page.getByRole("link", { name: /^(Explore collections|Explorer les Collections)$/u }).click();
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}

async function verifyCollectionAfterRestart(page: Page): Promise<void> {
    await adminPageLink(page, "collections").click();
    await installedCollectionLink(page, "ulvia.test/smoke-kit").waitFor();
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}

function installedCollectionLink(page: Page, collectionId: string) {
    return page
        .locator(`a[href="/admin/collections/detail?ulvia--mossa--collection=${encodeURIComponent(collectionId)}"]`)
        .first();
}
