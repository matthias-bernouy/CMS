import { describe, expect, test } from "bun:test";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { SuccessReplaceFailingIntegrationInstallationRepository } from "../../helpers";
import { blocDefinition, definition, hookCleanupDefinition } from "./cleanupDefinitions";
import { install, upgrade } from "./cleanupSupport";

describe("@bernouy/cms-integrations obsolete artifact cleanup", () => {
    test("restores deleted artifacts when successful installation persistence fails", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const secrets = new InMemorySecretStore();
        const installations = new SuccessReplaceFailingIntegrationInstallationRepository();
        const previous = definition("cleanup", "1.0.0", true);
        const current = definition("cleanup", "2.0.0", false);

        await install(previous, { sources, functions, secrets, installations });
        await expect(upgrade(current, { sources, functions, secrets, installations })).rejects.toThrow(
            /installation replace failed/,
        );

        expect(await sources.getSource("urn:legacy-source")).not.toBeNull();
        expect(await functions.getFunction("legacyFunction")).not.toBeNull();
        const installation = await installations.get("cleanup");
        expect(installation?.status).toBe("failed");
        expect(installation?.artifacts.map((artifact) => [artifact.type, artifact.id])).toEqual([
            ["source", "urn:legacy-source"],
            ["function", "legacyFunction"],
        ]);
    });

    test("fails safely when an obsolete bloc cannot be deleted transactionally", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = blocDefinition("1.0.0", true);
        const current = blocDefinition("2.0.0", false);
        const deps = {
            sources,
            secrets,
            blocs: {
                async importBloc(artifact: { tag: string }) {
                    return { id: artifact.tag, action: "created" as const };
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [previous],
            dto: { kind: previous.kind, answers: {}, options: {} },
        });
        await expect(
            runIntegrationInstallation({
                mode: "upgrade",
                deps,
                installations,
                integrationId: current.kind,
                targetDefinition: current,
            }),
        ).rejects.toThrow(/bloc deletion is not supported/);

        const installation = await installations.get("bloc-cleanup");
        expect(installation?.status).toBe("failed");
        expect(installation?.artifacts).toEqual([{ type: "bloc", id: "legacy-card", action: "created" }]);
    });

    test("restores obsolete artifacts when the changed installation hook fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = hookCleanupDefinition("1.0.0", true);
        const current = hookCleanupDefinition("2.0.0", false);
        const deps = {
            sources,
            secrets,
            sourceExecutorDeps: {
                fetchImpl: async (input: string | URL | Request) => {
                    const request = new Request(input);
                    return request.url.endsWith("/2.0.0")
                        ? Response.json({ error: "sync rejected" }, { status: 503 })
                        : Response.json({});
                },
            },
        };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [previous],
            dto: { kind: previous.kind, answers: {}, options: {} },
        });
        await expect(
            runIntegrationInstallation({
                mode: "upgrade",
                deps,
                installations,
                integrationId: current.kind,
                targetDefinition: current,
            }),
        ).rejects.toThrow(/afterInstallation/);

        expect(await sources.getSource("urn:legacy-source")).not.toBeNull();
        expect((await sources.getSource("urn:hook-source"))?.endpoints[0]?.targetUrl).toEndWith("/1.0.0");
        const installation = await installations.get(current.kind);
        expect(installation?.status).toBe("failed");
        expect(installation?.artifacts.map(({ id }) => id)).toEqual(["urn:hook-source", "urn:legacy-source"]);
    });
});
