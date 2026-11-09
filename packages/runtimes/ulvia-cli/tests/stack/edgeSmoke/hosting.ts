import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import { connectBrowser } from "../../../../../../tests/integration/instance/oauth";
import { assertEmptySite, selectEmptySite, signInForSetup } from "./setup";
import type { HostedSite } from "./setup";

export async function prepareHostedSites(browser: Browser, data: string, proxyPort: number) {
    const administrator = JSON.parse(
        await readFile(join(data, "services/credentials/control-administrator.json"), "utf8"),
    );
    const control = { origin: `http://control.localhost:${proxyPort}`, administrator };
    const registryOrigin = `http://registry.localhost:${proxyPort}`;
    const page = await browser.newPage({ locale: "en-US" });
    try {
        await signInForSetup(page, control);
        await page.getByRole("button", { name: "A Repository address", exact: false }).click();
        await page.getByLabel("Repository address", { exact: true }).fill(registryOrigin);
        await page.getByRole("button", { name: "Use this Repository", exact: false }).click();
        await selectEmptySite(page);
    } finally {
        await page.close();
    }
    const { api, actor } = await assertEmptySite(control);
    const create = async (
        name: string,
        connection?: Awaited<ReturnType<typeof connectBrowser>>,
    ): Promise<HostedSite> => {
        const input = {
            requestId: crypto.randomUUID(),
            label: `Smoke ${name}`,
            origin: `http://${name}.localhost:${proxyPort}`,
            administrator: { email: `${name}@ulvia.local`, password: `Smoke-${crypto.randomUUID()}` },
        };
        const deadline = Date.now() + 120_000;
        for (;;) {
            const result = connection
                ? await connection.call("ulvia/cms.hosting", "instances.create", input)
                : await (async () => {
                      const response = await api.request(
                          "ulvia/cms.hosting",
                          "/hosting/instances.create",
                          "POST",
                          input,
                          actor,
                      );
                      expect(response.status, response.ok ? "" : await response.text()).toBe(200);
                      return response.json();
                  })();
            if (result.instance.status === "ready") {
                expect(result.domain.state).toBe("active");
                return { id: result.instance.id, origin: input.origin, administrator: input.administrator };
            }
            if (Date.now() >= deadline || result.instance.status === "failed") {
                throw new Error(`Hosted ${name} did not become ready: ${result.instance.status}`);
            }
            await Bun.sleep(250);
        }
    };
    const registry = await create("registry");
    const connection = await connectBrowser(control.origin, administrator);
    let primary: HostedSite;
    try {
        primary = await create("default", connection);
        const throughMcp = await connection.call("ulvia/cms.hosting", "instances.list", { after: null, limit: 50 });
        expect(throughMcp.items).toHaveLength(3);
    } finally {
        await connection.browser.close();
    }
    expect(registry.id).not.toBe(primary.id);
    const listed = await api.request(
        "ulvia/cms.hosting",
        "/hosting/instances.list",
        "QUERY",
        { after: null, limit: 50 },
        actor,
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).items).toHaveLength(3);
    return { control, registry, primary };
}

export async function initializeSmokeRegistry(browser: Browser, registry: HostedSite) {
    const page = await browser.newPage({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
    try {
        await signInForSetup(page, registry);
        await page.getByRole("button", { name: "A new Repository", exact: false }).waitFor();
        await page.screenshot({ path: "/tmp/ulvia-setup-repository.png", fullPage: true });
        await page.setViewportSize({ width: 375, height: 812 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: "/tmp/ulvia-setup-repository-mobile.png", fullPage: true });
        await page.getByRole("button", { name: "A new Repository", exact: false }).click();
        await selectEmptySite(page);
    } finally {
        await page.close();
    }
    await assertEmptySite(registry);
}
export function siteCredentials(site: HostedSite) {
    return { adminEmail: site.administrator.email, adminPassword: site.administrator.password };
}
