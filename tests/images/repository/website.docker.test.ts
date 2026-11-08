import { expect, test } from "bun:test";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { mcpContainers } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";
import { sampleContract } from "../../integration/instance/repository/publication/resource";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE };

test.skipIf(!images.edge || !images.provider)(
    "the shipped Repository API supports ordinary publishing accounts, refusal isolation and persistent authored Pages",
    async () => {
        const f = await mcpContainers(images as Record<keyof typeof images, string>);
        try {
            const api = repositoryApi(f.repositoryUrl);
            const email = "website-owner@example.test";
            const password = "Website-owner-long-password";
            const owner = await api.signup(email, password);
            expect(owner.administrator).toBe(false);
            const pat = await api.pat(owner.cookie);
            const namespace = "website.owner";
            expect(
                (await api.request("ulvia/repository", "/v1/namespace-actions/claim", "POST", { namespace }, pat))
                    .status,
            ).toBe(200);

            const administrator = await api.session(
                f.repository.administrator.email,
                f.repository.administrator.password,
            );
            const deletion = await api.request(
                "ulvia/cms.access",
                "/delete-user",
                "POST",
                { sub: owner.accountId },
                administrator,
            );
            expect(deletion.status).toBe(409);
            expect((await deletion.json()).error.code).toBe("PROTECTED_USER");
            const retained = await api.session(email, password);
            expect(retained.accountId).toBe(owner.accountId);

            const neighbour = repositoryApi(f.cmsUrl);
            const neighbourAdministrator = await neighbour.session(f.administrator.email, f.administrator.password);
            expect(
                (
                    await neighbour.request(
                        "ulvia/cms.access",
                        "/personal-access-tokens",
                        "GET",
                        undefined,
                        neighbourAdministrator,
                    )
                ).status,
            ).toBe(200);
            for (const credentials of [{ cookie: retained.cookie }, pat]) {
                expect(
                    (
                        await neighbour.request(
                            "ulvia/cms.access",
                            "/personal-access-tokens",
                            "GET",
                            undefined,
                            credentials,
                        )
                    ).status,
                ).toBe(401);
            }
            const neighbourPat = await neighbour.pat(neighbourAdministrator.cookie);
            expect(
                (await neighbour.request("ulvia/cms.access", "/personal-access-tokens", "GET", undefined, neighbourPat))
                    .status,
            ).toBe(200);
            for (const credentials of [neighbourAdministrator, neighbourPat]) {
                expect(
                    (await api.request("ulvia/repository", "/v1/namespaces", "GET", undefined, credentials)).status,
                ).toBe(401);
            }

            const info = await (await api.request("ulvia/repository", "/v1/info")).json();
            const sample = await sampleContract(namespace);
            const client = new RemoteRepositoryClient(
                f.repositoryUrl,
                {
                    origin: f.repositoryUrl,
                    repositoryId: info.repositoryId,
                    namespace,
                    revision: 1,
                    resolveToken: async () => pat.token,
                },
                { allowInsecureHttp: true },
            );
            const publication = await client.push({
                kind: "contract",
                canonicalJson: JSON.parse(sample.manifest).canonicalJson,
                assets: [{ id: sample.asset.id, bytes: sample.bytes }],
            });
            expect(publication.digest).toBe(sample.digest);
            const created = await api.request(
                "ulvia/cms.content",
                "/pages/create",
                "POST",
                {
                    path: "/",
                    title: "Repository journey",
                    content:
                        '<div cms-bloc="ulvia-dtest--smoke-kit--card"><h1 slot="content">Repository journey</h1></div>',
                },
                administrator,
            );
            expect(created.status).toBe(201);

            const pages = await api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 100 }, administrator);
            expect(pages.status).toBe(200);
            const before = (await pages.json()).items as { id: string; path: string }[];
            const pageId = before.find(({ path }) => path === "/")!.id;
            const original = await (
                await api.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pageId }, administrator)
            ).json();
            expect(
                (
                    await api.request(
                        "ulvia/cms.content",
                        "/pages/update",
                        "POST",
                        { id: pageId, expectedRevision: original.revision, title: "My retained Repository catalogue" },
                        administrator,
                    )
                ).status,
            ).toBe(200);
            await f.restartProvider();
            const saved = await api.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pageId }, administrator);
            expect(saved.status).toBe(200);
            expect(await saved.json()).toMatchObject({
                title: "My retained Repository catalogue",
                content: original.content,
            });
            const after = await api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 100 }, administrator);
            expect((await after.json()).items.map(({ id }: { id: string }) => id).toSorted()).toEqual(
                before.map(({ id }) => id).toSorted(),
            );
            expect((await api.session(email, password)).accountId).toBe(owner.accountId);
            const inventory = await api.request("ulvia/repository", "/v1/namespaces", "GET", undefined, pat);
            expect(inventory.status).toBe(200);
            expect((await inventory.json()).namespaces).toContainEqual(
                expect.objectContaining({ namespace, revision: 1 }),
            );
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            await f.close();
        }
    },
    240_000,
);
