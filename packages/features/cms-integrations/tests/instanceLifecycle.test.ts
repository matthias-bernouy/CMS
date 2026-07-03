import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstanceRepository,
    runIntegrationInstance,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact, TEST_SECRET_SOURCE_DEFINITION } from "./helpers";

describe("@bernouy/cms-integrations instance lifecycle", () => {
    test("does not persist a new instance when the first import fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await expect(runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main" }, options: {} },
        })).rejects.toThrow(/apiKey/);

        expect(await instances.get("test-secret-source:secret-source-main")).toBeNull();
    });

    test("reruns an instance with stored server-side secrets and force", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        const result = await runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "test-secret-source:secret-source-main",
            body: {},
        });

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "updated" }]);
        expect(result.instance.runCount).toBe(2);
        expect(result.instance.runs.map(run => run.status)).toEqual(["success", "success"]);
        expect(JSON.stringify(result.instance)).not.toContain("sk_test");
    });

    test("reruns with the current definition before falling back to the stored snapshot", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const oldDefinition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const currentDefinition = rerunDefinition("1.0.1", "https://api.example.com/v2/items");

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [oldDefinition],
            dto: { kind: oldDefinition.kind, answers: { id: "rerun-source" }, options: {} },
        });

        const result = await runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "rerun-definition:rerun-source",
            body: {},
            siteIntegrations: [currentDefinition],
        });
        const source = await sources.getSource("urn:rerun-source");

        expect(result.instance.definitionVersion).toBe("1.0.1");
        expect(result.instance.definitionSnapshot?.version).toBe("1.0.1");
        expect(source?.endpoints[0]?.targetUrl).toBe("https://api.example.com/v2/items");
    });

    test("records a failed rerun when answers try to change the identity", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_test" }, options: {} },
        });

        await expect(runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "test-secret-source:secret-source-main",
            body: { answers: { id: "secret-source-other" } },
        })).rejects.toThrow(/cannot be changed/);

        const instance = await instances.get("test-secret-source:secret-source-main");
        expect(instance?.status).toBe("failed");
        expect(instance?.runCount).toBe(2);
        expect(instance?.runs.map(run => run.status)).toEqual(["success", "failed"]);
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
