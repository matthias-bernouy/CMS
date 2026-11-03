import { expect, test } from "bun:test";
import { join } from "node:path";
import { repositoryProcesses } from "./native";
import { repositoryApi } from "./client";
import { exercisePublication } from "./publication/scenario";
import { exerciseCli, exerciseCmsAuthoring } from "./clientFlows";
import { publicDownload } from "./publication/assets";
import { exerciseRepositoryWebsite } from "./website";

const enabled = Boolean(process.env.ULVIA_REPOSITORY_TEST_MONGO_URL && process.env.ULVIA_REPOSITORY_TEST_MODEL_DIR);

test.skipIf(!enabled)(
    "the Repository boots through real Provider/Edge processes and ordinary accounts own namespaces",
    async () => {
        const f = await repositoryProcesses();
        try {
            const api = repositoryApi(f.cmsUrl);
            const info = await api.request("ulvia.repository", "/v1/info");
            expect(info.status).toBe(200);
            expect(await info.json()).toEqual({
                protocol: "ulvia-repository/v2",
                repositoryId: f.registry.instance.id,
            });
            const a = await api.signup("a@example.test", "Repository-a-long-password");
            const b = await api.signup("b@example.test", "Repository-b-long-password");
            expect(a.administrator).toBe(false);
            expect(b.administrator).toBe(false);
            const token = await api.pat(a.cookie);
            const expiring = await api.pat(a.cookie, new Date(Date.now() + 1200).toISOString());
            expect((await api.request("ulvia.repository", "/v1/namespaces", "GET", undefined, expiring)).status).toBe(
                200,
            );
            await Bun.sleep(1250);
            expect((await api.request("ulvia.repository", "/v1/namespaces", "GET", undefined, expiring)).status).toBe(
                401,
            );
            const claim = await api.request(
                "ulvia.repository",
                "/v1/namespace-actions/claim",
                "POST",
                { namespace: "journey.a" },
                token,
            );
            expect(claim.status).toBe(200);
            expect(await claim.json()).toMatchObject({ namespace: "journey.a", revision: 1 });
            const inventory = await api.request("ulvia.repository", "/v1/namespaces", "GET", undefined, token);
            expect(inventory.status).toBe(200);
            expect(JSON.stringify(await inventory.json())).not.toContain(a.accountId);
            const admin = await api.session(f.admin.email, f.admin.password);
            const refused = await api.request("ulvia.cms.access", "/delete-user", "POST", { sub: a.accountId }, admin);
            expect(refused.status).toBe(409);
            expect((await refused.json()).error.code).toBe("PROTECTED_USER");
            const publication = await exercisePublication(api, f.cmsUrl, token, b);
            await exerciseCli(f.root, f.cmsUrl, token.token);
            await exerciseCmsAuthoring(api, f.cmsUrl, admin, publication.token, token);
            await exerciseRepositoryWebsite(f.cmsUrl, f.root, publication.sample);
            const pages = await api.request("ulvia.cms.content", "/pages/list", "QUERY", { limit: 100 }, admin);
            expect(pages.status).toBe(200);
            const before = (await pages.json()).items as { id: string; path: string }[];
            const catalogue = before.find(({ path }) => path === "/")!;
            const original = await (
                await api.request("ulvia.cms.content", "/pages/get", "QUERY", { id: catalogue.id }, admin)
            ).json();
            const edited = await api.request(
                "ulvia.cms.content",
                "/pages/update",
                "POST",
                {
                    id: catalogue.id,
                    expectedRevision: original.revision,
                    title: "My persistent Repository catalogue",
                },
                admin,
            );
            expect(edited.status).toBe(200);
            const neighbour = repositoryApi(await f.neighbour());
            const foreign = await neighbour.request(
                "ulvia.cms.access",
                "/personal-access-tokens",
                "GET",
                undefined,
                token,
            );
            expect(foreign.status).toBe(401);
            const absent = await neighbour.request("ulvia.repository", "/v1/info");
            expect(absent.status).toBe(404);
            await f.restart();
            const persisted = await api.request(
                "ulvia.cms.content",
                "/pages/get",
                "QUERY",
                { id: catalogue.id },
                admin,
            );
            expect(persisted.status).toBe(200);
            expect(await persisted.json()).toMatchObject({
                title: "My persistent Repository catalogue",
                content: original.content,
            });
            const after = await api.request("ulvia.cms.content", "/pages/list", "QUERY", { limit: 100 }, admin);
            expect((await after.json()).items.map(({ id }: { id: string }) => id).toSorted()).toEqual(
                before.map(({ id }) => id).toSorted(),
            );
            const retained = await api.request(
                "ulvia.repository",
                "/v1/namespaces",
                "GET",
                undefined,
                publication.token,
            );
            expect(retained.status).toBe(200);
            expect((await retained.json()).namespaces).toHaveLength(3);
            await publicDownload(f.cmsUrl, publication.sample);
            expect(await Bun.file(join(f.root, "denied-network.txt")).exists()).toBe(false);
        } finally {
            await f.close();
        }
    },
    240_000,
);
