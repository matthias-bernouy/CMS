import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { scratchRepository } from "../containers/scratch";
import { repositoryApi } from "./client";
import { initializationApi, installStarter } from "./initializationClient";
import { publishBundledReleases } from "./bootstrap";

const provider = process.env.ULVIA_COLLECTIONS_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_COLLECTIONS_EDGE_DOCKER_IMAGE;
const integration = provider && edge ? test : test.skip;

integration(
    "latest discovery and paged history remain usable while cold collection validation runs",
    async () => {
        const stack = await scratchRepository({ provider: provider!, edge: edge! });
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: "en-US" });
        const scriptErrors: string[] = [];
        page.on("pageerror", (error) => scriptErrors.push(error.message));
        try {
            const root = repositoryApi(stack.url);
            const session = await root.session(stack.administrator.email, stack.administrator.password);
            const setup = initializationApi(stack.url, session.cookie);
            const blank = await setup.plan(null);
            await setup.apply(null, blank.digest);
            const pat = await root.pat(session.cookie);
            await publishBundledReleases(stack.url, "http://ulvia-provider:5103", pat.token);
            const identity = await new RepositoryNamespaceClient(stack.url).identity();
            const namespaces = new RepositoryNamespaceClient(stack.url, {
                credential: {
                    origin: stack.url,
                    repositoryId: identity,
                    resolveToken: async () => pat.token,
                },
            });
            await namespaces.claim("load");
            const publisher = new RemoteRepositoryClient(stack.url, await namespaces.ownedCredential("load"));
            for (let version = 0; version < 31; version++) {
                const artifact = await admitCollectionRelease({
                    kind: "collection",
                    protocol: "ulvia-collection/v1",
                    schemaDialect: "ulvia-schema/v1",
                    publisherId: "load",
                    collectionId: "load/paged",
                    version: `1.0.${version}`,
                    name: "name",
                    locale: "en",
                    translations: { en: { name: "Paged collection" } },
                    blocs: [],
                    assets: [],
                });
                await publisher.push({ kind: "collection", canonicalJson: artifact.canonicalJson, assets: [] });
            }
            const site = await stack.createSite("collections");
            await installStarter(site.url, site.administrator, "ulvia/mossa");
            const api = repositoryApi(site.url);
            const actor = await api.session(site.administrator.email, site.administrator.password);
            await stack.restart();
            await stack.probeProvider();
            let finished = false;
            const request = api
                .request("ulvia/cms.installations", "/collections/catalogue", "QUERY", { limit: 25 }, actor)
                .then((response) => {
                    finished = true;
                    return response;
                });
            const samples: { status: number; durationMs: number }[] = [];
            while (!finished && samples.length < 150) {
                samples.push(await stack.probeProvider());
                await Bun.sleep(20);
            }
            const response = await request;
            expect(response.status).toBe(200);
            const catalogue = await response.json();
            expect(
                catalogue.releases.filter((item: { collectionId: string }) => item.collectionId === "load/paged"),
            ).toHaveLength(1);
            expect(
                catalogue.releases.find((item: { collectionId: string }) => item.collectionId === "load/paged").version,
            ).toBe("1.0.30");
            expect(samples.length).toBeGreaterThan(1);
            expect(samples.every((sample) => sample.status === 200)).toBe(true);
            const maximum = Math.max(...samples.map((sample) => sample.durationMs));
            console.info(
                "[collections-provider-health]",
                JSON.stringify({ samples: samples.length, maximumMs: maximum }),
            );
            expect(maximum).toBeLessThan(600);
            await writeFile(
                "/tmp/ulvia-collections-performance.json",
                JSON.stringify({ samples, maximumMs: maximum }, null, 2),
            );
            await page.goto(`${site.url}/login`);
            await page.getByLabel(/^(Email address|Adresse e-mail)$/u).fill(site.administrator.email);
            await page.getByLabel(/^(Password|Mot de passe)$/u).fill(site.administrator.password);
            await page.getByRole("button", { name: /^(Sign in|Se connecter)$/u }).click();
            await page.waitForURL(`${site.url}/admin`);
            await page.goto(`${site.url}/admin/collections`);
            const card = page
                .locator('[role="listitem"]')
                .filter({ has: page.getByRole("heading", { name: "Paged collection", exact: true }) });
            await card.waitFor();
            expect(await card.count()).toBe(1);
            await card.getByText("load 1.0.30", { exact: true }).waitFor();
            await page.screenshot({ path: "/tmp/ulvia-optis-catalogue.png", fullPage: true });
            await card.getByRole("link", { name: /^(Release history|Historique des versions)$/u }).click();
            await page.locator("tbody tr").nth(24).waitFor();
            expect(await page.locator("tbody tr").count()).toBe(25);
            await page.getByRole("link", { name: /^(Next page|Page suivante)$/u }).click();
            await page.locator("tbody tr").nth(5).waitFor();
            expect(await page.locator("tbody tr").count()).toBe(6);
            await page.screenshot({ path: "/tmp/ulvia-optis-history.png", fullPage: true });
            await page.setViewportSize({ width: 375, height: 812 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            expect(scriptErrors).toEqual([]);
        } catch (error) {
            await page.screenshot({ path: "/tmp/ulvia-optis-failure.png", fullPage: true }).catch(() => {});
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await browser.close();
            await stack.close();
        }
    },
    360_000,
);
