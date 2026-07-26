import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { rerunDefinition } from "./definitions";

describe("@bernouy/cms-integrations explicit upgrades", () => {
    test("changes the definition pin only after a successful upgrade", async () => {
        const context = await installedContext();
        const upgradeDefinition = rerunDefinition("1.1.0", "https://api.example.com/v2/items");

        const result = await runIntegrationInstallation({
            mode: "upgrade",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: context.installedDefinition.kind,
            targetDefinition: upgradeDefinition,
        });

        expect(result.installation.definitionVersion).toBe("1.1.0");
        expect(result.installation.definitionSnapshot?.version).toBe("1.1.0");
        expect((await context.sources.getSource("urn:rerun-source"))?.endpoints[0]?.targetUrl).toBe(
            "https://api.example.com/v2/items",
        );
    });

    test("keeps the previous pin when validation fails", async () => {
        const context = await installedContext();
        const upgradeDefinition: IntegrationDefinition = {
            ...rerunDefinition("1.1.0", "https://api.example.com/v2/items"),
            inputs: [
                ...context.installedDefinition.inputs,
                { name: "requiredValue", label: "Required value", type: "text", required: true },
            ],
        };

        await expect(upgrade(context, upgradeDefinition)).rejects.toThrow(/requiredValue/);
        await expectPreviousPin(context);
    });

    test("rejects a downgrade before changing the installation state", async () => {
        const context = await installedContext("1.1.0");

        await expect(upgrade(context, rerunDefinition("1.0.0", "https://api.example.com/v1/items"))).rejects.toThrow(
            /is not newer than installed version "1\.1\.0"/,
        );

        const unchanged = await context.installations.get(context.installedDefinition.kind);
        expect(unchanged?.status).toBe("success");
        expect(unchanged?.definitionVersion).toBe("1.1.0");
        expect(unchanged?.runCount).toBe(1);
    });

    test("rolls back the pin when post-installation reconciliation fails", async () => {
        const context = await installedContext();
        const upgradeDefinition: IntegrationDefinition = {
            ...rerunDefinition("1.1.0", "https://api.example.com/v2/items"),
            afterInstallation: [
                {
                    id: "missing-source",
                    steps: [
                        {
                            id: "call",
                            call: { source: "missing-source", endpoint: "missing-endpoint" },
                        },
                    ],
                },
            ],
        };

        await expect(upgrade(context, upgradeDefinition)).rejects.toThrow(/missing-source/);
        await expectPreviousPin(context);
    });

    test("blocks an upgrade that would violate an installed dependent range before changing state", async () => {
        const context = await installedContext();
        await context.installations.create({
            id: "dependent",
            label: "Dependent",
            definitionVersion: "1.0.0",
            definitionSnapshot: {
                kind: "dependent",
                label: "Dependent",
                version: "1.0.0",
                inputs: [],
                dependencies: [{ name: "target", kind: context.installedDefinition.kind, versionRange: "^1.0.0" }],
            },
            status: "success",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            artifacts: [],
            runs: [],
        });

        await expect(upgrade(context, rerunDefinition("2.0.0", "https://api.example.com/v2/items"))).rejects.toThrow(
            /installed integration "dependent" requires "\^1\.0\.0"/,
        );

        const unchanged = await context.installations.get(context.installedDefinition.kind);
        expect(unchanged?.status).toBe("success");
        expect(unchanged?.definitionVersion).toBe("1.0.0");
        expect(unchanged?.runCount).toBe(1);
    });
});

async function installedContext(version = "1.0.0") {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const installations = new InMemoryIntegrationInstallationRepository();
    const installedDefinition = rerunDefinition(version, "https://api.example.com/v1/items");
    await runIntegrationInstallation({
        mode: "create",
        deps: { sources, secrets },
        installations,
        siteIntegrations: [installedDefinition],
        dto: { kind: installedDefinition.kind, answers: { id: "rerun-source" }, options: {} },
    });
    return { sources, secrets, installations, installedDefinition };
}

type InstalledContext = Awaited<ReturnType<typeof installedContext>>;

function upgrade(context: InstalledContext, targetDefinition: IntegrationDefinition) {
    return runIntegrationInstallation({
        mode: "upgrade",
        deps: { sources: context.sources, secrets: context.secrets },
        installations: context.installations,
        integrationId: context.installedDefinition.kind,
        targetDefinition,
    });
}

async function expectPreviousPin(context: InstalledContext): Promise<void> {
    const installation = await context.installations.get(context.installedDefinition.kind);
    expect(installation?.status).toBe("failed");
    expect(installation?.definitionVersion).toBe("1.0.0");
    expect(installation?.definitionSnapshot?.version).toBe("1.0.0");
    expect((await context.sources.getSource("urn:rerun-source"))?.endpoints[0]?.targetUrl).toBe(
        "https://api.example.com/v1/items",
    );
}
