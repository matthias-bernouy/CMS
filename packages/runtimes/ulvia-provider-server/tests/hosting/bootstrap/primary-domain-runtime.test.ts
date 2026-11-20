import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { hostingRuntimeFixture } from "../runtime-fixture";
import { startTestEdge } from "../edge-process";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { instanceDatabaseName } from "../../../src/runtime/stores/storageRoots";

const mongoUrl = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = mongoUrl ? test : test.skip;

integration(
    "primary election updates real public delivery and MCP on both Edges and survives Control restart",
    async () => {
        const f = await hostingRuntimeFixture(mongoUrl!);
        const edges: Awaited<ReturnType<typeof startTestEdge>>[] = [];
        let provider: Awaited<ReturnType<typeof f.startProvider>> | undefined;
        try {
            const control = await f.hosting.initialize();
            provider = await f.startProvider();
            edges.push(await startTestEdge(), await startTestEdge());
            const edge = edges[0]!;
            const login = await edge.request("control.localhost", "/.cms/call/ulvia/cms.access/login-password", {
                method: "POST",
                headers: { origin: "http://control.localhost", "content-type": "application/json" },
                body: JSON.stringify({ email: "operator@example.test", password: "protected-operator-password" }),
            });
            expect(login.status, await login.clone().text()).toBe(200);
            const cookie = login.headers
                .getSetCookie()
                .map((value) => value.split(";")[0]!)
                .join("; ");
            await login.text();
            const command = async (id: string, input: unknown, method = "POST") => {
                const response = await edge.request("control.localhost", `/.cms/call/ulvia/cms.hosting/hosting/${id}`, {
                    method,
                    headers: { cookie, origin: "http://control.localhost", "content-type": "application/json" },
                    body: JSON.stringify(input),
                });
                expect(response.status, await response.clone().text()).toBe(200);
                return response.json();
            };
            const created = await command("instances.create", {
                requestId: crypto.randomUUID(),
                label: "Primary domain site",
                origin: "http://one.localhost",
                administrator: { email: "one@example.test", password: "isolated-site-password" },
            });
            const before = (await f.instances.get(created.instance.id))!;
            const repo = new MongoContentRepository(f.client.db(instanceDatabaseName(before.storageKey)));
            const settings = await repo.getSystem();
            await repo.updateSystem({ site: { ...settings.site, visible: true } }, await repo.getSystemRevision());
            await repo.insertPage("/domain-test", "Domain test");
            const page = (await repo.getPage("/domain-test"))!;
            await repo.updatePage({ id: page.id, visible: true }, page.revision);
            const claimed = await command("domains.claim", { instanceId: before.id, origin: "http://alias.localhost" });
            for (const candidate of edges) {
                const response = await candidate.request("one.localhost", "/domain-test");
                expect(response.status, await response.clone().text()).toBe(200);
                expect(await response.text()).toContain("<title>Domain test</title>");
            }
            const elected = await command("instances.set-primary-domain", {
                instanceId: before.id,
                hostname: claimed.domain.hostname,
                expectedInstanceRevision: before.revision,
                expectedDomainRevision: claimed.domain.revision,
            });
            expect(elected.origin).toBe("http://alias.localhost");
            const after = (await f.instances.get(before.id))!;
            expect(after.gatewayUrl).toBe(before.gatewayUrl);
            expect(after.repository).toEqual(before.repository);
            expect(after.idempotencyFingerprint).toBe(before.idempotencyFingerprint);
            for (const candidate of edges) {
                const old = await candidate.request("one.localhost", "/domain-test?q=1");
                expect(old.status).toBe(308);
                expect(old.headers.get("location")).toBe("http://alias.localhost/domain-test?q=1");
                const current = await candidate.request("alias.localhost", "/domain-test");
                expect(current.status, await current.clone().text()).toBe(200);
                expect(await current.text()).toContain("<title>Domain test</title>");
                const metadata = await candidate.request("alias.localhost", "/.well-known/oauth-protected-resource");
                expect(metadata.status).toBe(200);
                expect((await metadata.json()).resource).toBe("http://alias.localhost/.cms/mcp");
            }
            const firstDomain = await f.hosting.store.getDomain("one.localhost");
            await command("instances.set-primary-domain", {
                instanceId: before.id,
                hostname: "one.localhost",
                expectedInstanceRevision: after.revision,
                expectedDomainRevision: firstDomain!.revision,
            });
            for (const candidate of edges) {
                expect((await candidate.request("one.localhost", "/domain-test")).status).toBe(200);
                expect((await candidate.request("alias.localhost", "/domain-test")).status).toBe(308);
            }
            const controlAlias = await command("domains.claim", {
                instanceId: control.instance.id,
                origin: "http://control-primary.localhost",
            });
            await command("instances.set-primary-domain", {
                instanceId: control.instance.id,
                hostname: controlAlias.domain.hostname,
                expectedInstanceRevision: control.instance.revision,
                expectedDomainRevision: controlAlias.domain.revision,
            });
            const currentControl = await edge.request(
                "control-primary.localhost",
                "/.well-known/oauth-protected-resource",
            );
            expect(currentControl.status, await edge.diagnostics()).toBe(200);
            await currentControl.body?.cancel();
            expect((await command("instances.get", { instanceId: control.instance.id }, "QUERY")).origin).toBe(
                "http://control-primary.localhost",
            );
            await rm(f.bootstrapFile);
            await provider.stop();
            provider = undefined;
            const reopened = await f.hosting.initialize();
            expect(reopened.instance.id).toBe(control.instance.id);
            expect(reopened.instance.cmsUrl).toBe("http://control-primary.localhost");
            expect(reopened.installation.controlOrigin).toBe("http://control.localhost");
            provider = await f.startProvider();
            let response = await edge.request("control-primary.localhost", "/.well-known/oauth-protected-resource");
            const deadline = Date.now() + 5000;
            while (response.status === 503 && Date.now() < deadline) {
                await response.body?.cancel();
                await Bun.sleep(50);
                response = await edge.request("control-primary.localhost", "/.well-known/oauth-protected-resource");
            }
            expect(response.status, await edge.diagnostics()).toBe(200);
            expect((await response.json()).resource).toBe("http://control-primary.localhost/.cms/mcp");
        } finally {
            await Promise.all(edges.map((edge) => edge.close()));
            await provider?.stop();
            await f.close();
        }
    },
    120_000,
);
