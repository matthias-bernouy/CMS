import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { scratchRepository } from "../containers/scratch";
import { repositoryApi } from "./client";
import { initializationApi } from "./initializationClient";
import { publishBundledReleases } from "./bootstrap";

const provider = process.env.ULVIA_COLLECTIONS_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_COLLECTIONS_EDGE_DOCKER_IMAGE;
const integration = provider && edge ? test : test.skip;

integration(
    "latest discovery and paged history remain usable while cold collection validation runs",
    async () => {
        const stack = await scratchRepository({ provider: provider!, edge: edge! });
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
            const versions = await api.request(
                "ulvia/cms.installations",
                "/collections/releases",
                "QUERY",
                {
                    repositoryId: catalogue.releases[0].repositoryId,
                    publisherId: "load",
                    collectionId: "load/paged",
                    limit: 25,
                },
                actor,
            );
            expect(versions.status).toBe(200);
            const history = await versions.json();
            expect(history.releases).toHaveLength(25);
            const next = await api.request(
                "ulvia/cms.installations",
                "/collections/releases",
                "QUERY",
                {
                    repositoryId: catalogue.releases[0].repositoryId,
                    publisherId: "load",
                    collectionId: "load/paged",
                    limit: 25,
                    cursor: history.cursor,
                },
                actor,
            );
            expect(next.status).toBe(200);
            expect((await next.json()).releases).toHaveLength(6);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await stack.close();
        }
    },
    360_000,
);
