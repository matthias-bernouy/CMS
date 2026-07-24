import { describe, expect, test } from "bun:test";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { producerDefinition, targetDefinition } from "./fixtures";
import { upgradableHookDefinition } from "./upgradeFixture";

describe("@bernouy/cms-integrations afterInstallation failures", () => {
    test("marks a waiting hook owner failed without failing the new dependency", async () => {
        const harness = failureHarness();

        await harness.install("producer", "producer-source");
        await expect(harness.install("target", "target-source")).rejects.toThrow(/afterInstallation/);

        const producer = await harness.installations.get("producer");
        const target = await harness.installations.get("target");
        expect(producer?.status).toBe("failed");
        expect(producer?.runs.at(-1)?.status).toBe("failed");
        expect(producer?.runs.at(-1)?.artifacts).not.toEqual([]);
        expect(target?.status).toBe("success");
    });

    test("runs the changed installation hook inside the artifact rollback boundary", async () => {
        const harness = failureHarness();

        await harness.install("target", "target-source");
        await expect(harness.install("producer", "producer-source")).rejects.toThrow(/afterInstallation/);

        const producer = await harness.installations.get("producer");
        expect(producer?.status).toBe("failed");
        expect(producer?.runs.at(-1)?.status).toBe("failed");
        expect(await harness.sources.getSource("urn:producer-source")).toBeNull();
        expect((await harness.installations.get("target"))?.status).toBe("success");
    });

    test("rolls an existing installation back when an enabling hook fails", async () => {
        const sources = new InMemorySourceRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const secrets = new InMemorySecretStore();
        const definition = upgradableHookDefinition();
        const deps = {
            sources,
            installations,
            secrets,
            sourceExecutorDeps: {
                fetchImpl: async (input: string | URL | Request) => {
                    const request = new Request(input);
                    return request.url.endsWith("/true")
                        ? Response.json({ error: "sync rejected" }, { status: 503 })
                        : Response.json({});
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [definition],
            dto: { kind: definition.kind, answers: { id: "upgradable", enabled: false }, options: {} },
        });
        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps,
                installations,
                integrationId: definition.kind,
                body: { answers: { enabled: true } },
            }),
        ).rejects.toThrow(/afterInstallation/);

        const installation = await installations.get(definition.kind);
        expect(installation?.status).toBe("failed");
        expect(installation?.answersSnapshot.enabled).toBe(false);
        expect(installation?.runs.map(({ status }) => status)).toEqual(["success", "failed"]);
        expect((await sources.getSource("urn:upgradable"))?.endpoints[0]?.targetUrl).toEndWith("/false");
    });
});

function failureHarness() {
    const sources = new InMemorySourceRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const secrets = new InMemorySecretStore();
    const definitions = [producerDefinition(), targetDefinition()];
    const deps = {
        sources,
        installations,
        secrets,
        sourceExecutorDeps: {
            fetchImpl: async (input: string | URL | Request) => {
                const request = new Request(input);
                if (request.url.endsWith("/templates")) {
                    return Response.json({ items: [{ key: "order-paid" }] });
                }
                return Response.json({ error: "sync rejected" }, { status: 503 });
            },
        },
    };
    return {
        sources,
        installations,
        install: (kind: "producer" | "target", id: string) =>
            runIntegrationInstallation({
                mode: "create",
                deps,
                installations,
                siteIntegrations: definitions,
                dto: { kind, answers: { id }, options: {} },
            }),
    };
}
