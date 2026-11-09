import { initializationApi } from "./initializationClient";
import { expect, test } from "bun:test";
import { emptyCollectionFixture } from "./emptyFixture";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { scratchRepository } from "../containers/scratch";
import { docker } from "../docker";
import { repositoryApi } from "./client";
import { publishBundledReleases } from "./bootstrap";

const provider = process.env.ULVIA_SCRATCH_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE;
const integration = provider && edge ? test : test.skip;

integration(
    "a bare Repository accepts API publication and installation without any starter collection or Page",
    async () => {
        const stack = await scratchRepository({ provider: provider!, edge: edge! });
        try {
            const api = repositoryApi(stack.url);
            const session = await api.session(stack.administrator.email, stack.administrator.password);
            expect(session.administrator).toBe(true);
            const pages = () => api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, session);
            const installed = () =>
                api.request("ulvia/cms.installations", "/list-collection-installations", "GET", undefined, session);
            expect((await (await pages()).json()).items).toEqual([]);
            const initial = await (await installed()).json();
            expect(initial.items).toEqual([]);
            expect((await fetch(`${stack.url}/`, { redirect: "manual" })).status).toBe(303);
            const setup = initializationApi(stack.url, session.cookie);
            const empty = await setup.plan(null);
            await setup.apply(null, empty.digest);
            expect((await fetch(`${stack.url}/`, { redirect: "manual" })).status).toBe(404);
            const collections = new HttpCollectionRepository("scratch", stack.url, { allowInsecureHttp: true });
            expect(await collections.list()).toEqual([]);
            for (const path of [
                "/app/packages/official-repository",
                "/app/packages/runtimes/ulvia-cli/dist/bootstrap",
            ]) {
                expect((await docker(["exec", stack.providerName, "test", "-e", path], true)).code).not.toBe(0);
            }
            const pat = await api.pat(session.cookie);
            await publishBundledReleases(stack.url, "http://ulvia-provider:5103", pat.token);
            expect(await collections.list()).toEqual([]);
            const identity = new RepositoryNamespaceClient(stack.url, { allowInsecureHttp: true });
            const namespaces = new RepositoryNamespaceClient(stack.url, {
                allowInsecureHttp: true,
                credential: {
                    origin: stack.url,
                    repositoryId: await identity.identity(),
                    resolveToken: async () => pat.token,
                },
            });
            await namespaces.claim("scratch");
            const release = await emptyCollectionFixture("scratch", "empty", "1.0.0");
            const publisher = new RemoteRepositoryClient(stack.url, await namespaces.ownedCredential("scratch"), {
                allowInsecureHttp: true,
            });
            await publisher.push({
                kind: "collection",
                canonicalJson: release.canonicalJson,
                sourceJson: release.sourceJson,
                assets: [],
            });
            const [entry] = await collections.list();
            expect(entry!.collectionId).toBe("scratch/empty");
            const catalogue = await api.request(
                "ulvia/cms.installations",
                "/collections/catalogue",
                "QUERY",
                { limit: 25 },
                session,
            );
            expect(catalogue.status).toBe(200);
            const selected = (await catalogue.json()).releases.find(
                (item: { collectionId: string }) => item.collectionId === "scratch/empty",
            );
            expect(selected).toBeDefined();
            const install = await api.request(
                "ulvia/cms.installations",
                "/install-collection",
                "POST",
                {
                    expectedRevision: initial.revision,
                    targets: [
                        {
                            repositoryId: selected.repositoryId,
                            publisherId: selected.publisherId,
                            collectionId: selected.collectionId,
                            version: selected.version,
                            digest: selected.digest,
                            approvedBrowserRiskDigest: selected.browserRiskDigest,
                        },
                    ],
                },
                session,
            );
            expect(install.status, await install.clone().text()).toBe(200);
            expect((await install.json()).items.map((item: { collectionId: string }) => item.collectionId)).toEqual([
                "scratch/empty",
            ]);
            expect((await (await pages()).json()).items).toEqual([]);
            await stack.restart();
            expect((await pages()).status).toBe(200);
            expect(
                (await (await installed()).json()).items.map((item: { collectionId: string }) => item.collectionId),
            ).toEqual(["scratch/empty"]);
            expect((await collections.list())[0]!.digest).toBe(release.digest);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await stack.close();
        }
    },
    240_000,
);
