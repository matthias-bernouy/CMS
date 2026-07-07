import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact, TEST_SECRET_SOURCE_DEFINITION } from "./helpers";

describe("@bernouy/cms-integrations installation lifecycle", () => {
    test("does not persist a new installation when the first import fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();

        await expect(runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main" }, options: {} },
        })).rejects.toThrow(/apiKey/);

        expect(await installations.get("test-secret-source")).toBeNull();
    });

    test("reruns an installation with stored server-side secrets and force", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();

        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources, secrets },
            installations,
            integrationId: "test-secret-source",
            body: {},
        });

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "updated" }]);
        expect(result.installation.runCount).toBe(2);
        expect(result.installation.runs.map(run => run.status)).toEqual(["success", "success"]);
        expect(JSON.stringify(result.installation)).not.toContain("sk_test");
    });

    test("reruns with the current definition before falling back to the stored snapshot", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const oldDefinition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const currentDefinition = rerunDefinition("1.0.1", "https://api.example.com/v2/items");

        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [oldDefinition],
            dto: { kind: oldDefinition.kind, answers: { id: "rerun-source" }, options: {} },
        });

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources, secrets },
            installations,
            integrationId: "rerun-definition",
            body: {},
            siteIntegrations: [currentDefinition],
        });
        const source = await sources.getSource("urn:rerun-source");

        expect(result.installation.definitionVersion).toBe("1.0.1");
        expect(result.installation.definitionSnapshot?.version).toBe("1.0.1");
        expect(source?.endpoints[0]?.targetUrl).toBe("https://api.example.com/v2/items");
    });

    test("records a failed rerun when answers try to change the identity", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();

        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        await expect(runIntegrationInstallation({
            mode: "rerun",
            deps: { sources, secrets },
            installations,
            integrationId: "test-secret-source",
            body: { answers: { id: "secret-source-other" } },
        })).rejects.toThrow(/cannot be changed/);

        const installation = await installations.get("test-secret-source");
        expect(installation?.status).toBe("failed");
        expect(installation?.runCount).toBe(2);
        expect(installation?.runs.map(run => run.status)).toEqual(["success", "failed"]);
    });
});

function rerunDefinition(version: string, targetUrl: string): IntegrationDefinition {
    return {
        kind: "rerun-definition",
        label: "Rerun definition",
        version,
        category: "Test",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        artifacts: [sourceArtifact("{{answers.id}}", targetUrl)],
    };
}
