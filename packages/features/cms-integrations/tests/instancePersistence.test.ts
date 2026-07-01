import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstanceRepository,
    runIntegrationInstance,
    type IntegrationDefinition,
    type IntegrationRun,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    CreateFailingIntegrationInstanceRepository,
    sourceArtifact,
    STRIPE_DEFINITION,
    SuccessReplaceFailingIntegrationInstanceRepository,
} from "./helpers";

describe("@bernouy/cms-integrations instance persistence", () => {
    test("retains only the last twenty compact runs", async () => {
        const instances = new InMemoryIntegrationInstanceRepository();
        const now = new Date();
        const runs: IntegrationRun[] = Array.from({ length: 25 }, (_, index) => ({
            id: `run-${index + 1}`,
            runNumber: index + 1,
            status: "success",
            startedAt: now,
            finishedAt: now,
            artifacts: [],
        }));

        const created = await instances.create({
            id: "test:retention",
            kind: "test",
            label: "Retention",
            definitionVersion: "1",
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            runs,
        });

        expect(created.runs).toHaveLength(20);
        expect(created.runs[0]?.runNumber).toBe(6);
    });

    test("rolls back sources and secrets when instance creation fails after import", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new CreateFailingIntegrationInstanceRepository();
        const definition = unstableInstanceDefinition();

        await expect(runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: {
                kind: "unstable-instance",
                answers: { id: "main", apiKey: "secret" },
                options: {},
            },
        })).rejects.toThrow(/instance create failed/);

        expect(await sources.getSource("urn:main")).toBeNull();
        expect(await secrets.listKeys()).toEqual([]);
    });

    test("rolls back rerun writes when final instance persistence fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new SuccessReplaceFailingIntegrationInstanceRepository();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [STRIPE_DEFINITION],
            dto: { kind: "stripe", answers: { id: "stripe-main", apiKey: "sk_old" }, options: {} },
        });
        const before = await instances.get("stripe:stripe-main");
        const key = before!.secretRefs.apiKey;

        await expect(runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "stripe:stripe-main",
            body: { answers: { apiKey: "sk_new" } },
        })).rejects.toThrow(/instance replace failed/);

        expect(await secrets.get(key)).toBe("sk_old");
        const after = await instances.get("stripe:stripe-main");
        expect(after?.status).toBe("failed");
    });
});

function unstableInstanceDefinition(): IntegrationDefinition {
    return {
        kind: "unstable-instance",
        label: "Unstable Instance",
        inputs: [
            { name: "id", label: "ID", type: "text", required: true },
            { name: "apiKey", label: "API Key", type: "password", required: true, secret: true },
        ],
        secrets: [{ input: "apiKey", key: "UNSTABLE_{{env answers.id}}_KEY" }],
        artifacts: [sourceArtifact("{{answers.id}}")],
    };
}
