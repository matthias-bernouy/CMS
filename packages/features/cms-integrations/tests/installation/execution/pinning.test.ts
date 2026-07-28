import { describe, expect, test } from "bun:test";
import { InMemoryIntegrationInstallationRepository, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { rerunDefinition } from "./definitions";

describe("@bernouy/cms-integrations rerun pinning", () => {
    test("keeps the installed definition snapshot authoritative when stable moves", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const oldDefinition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const currentDefinition = rerunDefinition("1.0.1", "https://api.example.com/v2/items");

        await install(oldDefinition, sources, secrets, installations);
        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources, secrets },
            installations,
            integrationId: oldDefinition.kind,
            body: {},
            siteIntegrations: [currentDefinition],
        });

        expect(result.installation.definitionVersion).toBe("1.0.0");
        expect(result.installation.definitionSnapshot?.version).toBe("1.0.0");
        expect((await sources.getSource("urn:rerun-source"))?.endpoints[0]?.targetUrl).toBe(
            "https://api.example.com/v1/items",
        );
    });

    test("rejects a requested version change without changing the installation", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const installedDefinition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");

        await install(installedDefinition, sources, secrets, installations);
        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources, secrets },
                installations,
                integrationId: installedDefinition.kind,
                body: { version: "1.1.0" },
                siteIntegrations: [rerunDefinition("1.1.0", "https://api.example.com/v2/items")],
            }),
        ).rejects.toThrow(/explicit upgrade action/);

        const installation = await installations.get(installedDefinition.kind);
        expect(installation?.status).toBe("success");
        expect(installation?.runCount).toBe(1);
        expect(installation?.definitionVersion).toBe("1.0.0");
        expect(installation?.definitionSnapshot?.version).toBe("1.0.0");
    });

    test("rejects a mismatched resolved definition when the stored snapshot is absent", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const installedDefinition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const created = await install(installedDefinition, sources, secrets, installations);
        await installations.replace({ ...created.installation, definitionSnapshot: undefined });

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources, secrets },
                installations,
                integrationId: installedDefinition.kind,
                siteIntegrations: [rerunDefinition("2.0.0", "https://api.example.com/v2/items")],
            }),
        ).rejects.toThrow(/resolved version "2.0.0" instead of installed version "1.0.0"/);

        const installation = await installations.get(installedDefinition.kind);
        expect(installation?.status).toBe("success");
        expect(installation?.runCount).toBe(1);
        expect(installation?.definitionVersion).toBe("1.0.0");
    });
});

function install(
    definition: ReturnType<typeof rerunDefinition>,
    sources: InMemorySourceRepository,
    secrets: InMemorySecretStore,
    installations: InMemoryIntegrationInstallationRepository,
) {
    return runIntegrationInstallation({
        mode: "create",
        deps: { sources, secrets },
        installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
    });
}
