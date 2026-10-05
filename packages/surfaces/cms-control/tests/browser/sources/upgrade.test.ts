import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dir, "../../../src");
const bundle = await Bun.file(`${root}/browser/control-components.js`).text();
const contract = (version: string, digest: string) => ({
    repositoryId: "local",
    kind: "contract",
    publisherId: "ulvia.official",
    id: "catalog.items",
    name: "Catalog items",
    description: "Read public catalog items.",
    version,
    digest,
});

test("Explore sources finds ready upgrades and pins the selected provider release", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    const writes: unknown[] = [];
    const oldDigest = `sha256:${"a".repeat(64)}`;
    const newDigest = `sha256:${"b".repeat(64)}`;
    try {
        await page.route("http://cms.test/**", async (route) => {
            const request = route.request();
            const pathname = new URL(request.url()).pathname;
            if (pathname === "/cms/control.js") {
                await route.fulfill({ contentType: "text/javascript", body: bundle });
                return;
            }
            if (request.resourceType() === "document") {
                await route.fulfill({
                    contentType: "text/html",
                    body: '<meta name="basePath" content="/cms"><nav data-source-nav><a data-source-explore></a><span data-source-anchor></span></nav><cms-sources-workspace></cms-sources-workspace><script src="/cms/control.js"></script>',
                });
                return;
            }
            if (pathname === "/cms/api/provider-catalogue") {
                await route.fulfill({
                    json: {
                        repositories: ["local"],
                        available: [contract("0.1.0", oldDigest), contract("0.2.0", newDigest)],
                    },
                });
                return;
            }
            if (pathname === "/cms/api/provider-installations") {
                await route.fulfill({
                    json: {
                        installations: [
                            {
                                id: "old-provider",
                                providerId: "official",
                                accountId: "old",
                                status: "enabled",
                                contracts: [
                                    {
                                        contractId: "catalog.items",
                                        version: "0.1.0",
                                        digest: oldDigest,
                                        status: "ready",
                                    },
                                ],
                            },
                            {
                                id: "new-provider",
                                providerId: "official",
                                accountId: "new",
                                status: "enabled",
                                contracts: [
                                    {
                                        contractId: "catalog.items",
                                        version: "0.2.0",
                                        digest: newDigest,
                                        status: "ready",
                                    },
                                ],
                            },
                        ],
                        selected: [
                            {
                                installationId: "old-provider",
                                contractId: "catalog.items",
                                version: "0.1.0",
                                digest: oldDigest,
                            },
                        ],
                    },
                });
                return;
            }
            if (pathname === "/cms/api/source-select") {
                writes.push(request.postDataJSON());
                await route.fulfill({ status: 201, json: { selected: [] } });
                return;
            }
            await route.fulfill({ status: 404, body: "Missing" });
        });
        await page.goto("http://cms.test/cms/admin/sources?source=catalog.items");
        await page.getByRole("button", { name: "Upgrade to v0.2.0" }).click();
        expect(await page.locator("[data-modal-title]").textContent()).toBe("Upgrade source");
        await page.getByText("Only releases reported ready by this provider are listed.").waitFor();
        await page.getByRole("button", { name: "Save source" }).click();
        await page.waitForURL("http://cms.test/cms/admin/sources?source=catalog.items");
        expect(writes).toEqual([
            {
                repositoryId: "local",
                publisherId: "ulvia.official",
                id: "catalog.items",
                version: "0.2.0",
                digest: newDigest,
                installationId: "new-provider",
            },
        ]);
    } finally {
        await browser.close();
    }
}, 20000);
