import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
    type IntegrationRun,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    CreateFailingIntegrationInstallationRepository,
    sourceArtifact,
    TEST_SECRET_SOURCE_DEFINITION,
    SuccessReplaceFailingIntegrationInstallationRepository,
} from "./helpers";

describe("@bernouy/cms-integrations installation persistence", () => {
    test("retains only the last twenty compact runs", async () => {
        const installations = new InMemoryIntegrationInstallationRepository();
        const now = new Date();
        const runs: IntegrationRun[] = Array.from({ length: 25 }, (_, index) => ({
            id: `run-${index + 1}`,
            runNumber: index + 1,
            status: "success",
            startedAt: now,
            finishedAt: now,
            artifacts: [],
        }));

        const created = await installations.create({
            id: "test",
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

    test("rolls back sources and secrets when installation creation fails after import", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new CreateFailingIntegrationInstallationRepository();
        const definition = unstableInstallationDefinition();

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: { sources, secrets },
                installations,
                siteIntegrations: [definition],
                dto: {
                    kind: "unstable-installation",
                    answers: { id: "main", apiKey: "secret" },
                    options: {},
                },
            }),
        ).rejects.toThrow(/installation create failed/);

        expect(await sources.getSource("urn:main")).toBeNull();
        expect(await secrets.listKeys()).toEqual([]);
    });

    test("rolls back rerun writes when final installation persistence fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new SuccessReplaceFailingIntegrationInstallationRepository();

        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [TEST_SECRET_SOURCE_DEFINITION],
            dto: { kind: "test-secret-source", answers: { id: "secret-source-main", apiKey: "sk_old" }, options: {} },
        });
        const before = await installations.get("test-secret-source");
        const key = before!.secretRefs.apiKey;

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources, secrets },
                installations,
                integrationId: "test-secret-source",
                body: { answers: { apiKey: "sk_new" } },
            }),
        ).rejects.toThrow(/installation replace failed/);

        expect(await secrets.get(key)).toBe("sk_old");
        const after = await installations.get("test-secret-source");
        expect(after?.status).toBe("failed");
    });
});

function unstableInstallationDefinition(): IntegrationDefinition {
    return {
        kind: "unstable-installation",
        label: "Unstable Installation",
        inputs: [
            { name: "id", label: "ID", type: "text", required: true },
            { name: "apiKey", label: "API Key", type: "password", required: true, secret: true },
        ],
        secrets: [{ input: "apiKey", key: "UNSTABLE_{{env answers.id}}_KEY" }],
        artifacts: [sourceArtifact("{{answers.id}}")],
    };
}
