import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstanceRepository,
    runIntegrationInstance,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact } from "./helpers";

describe("@bernouy/cms-integrations instance secret safety", () => {
    test("rejects secret key collisions across tracked instances", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const definition = sharedSecretDefinition();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: { kind: "shared-secret", answers: { id: "one", apiKey: "one" }, options: {} },
        });

        await expect(runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: { kind: "shared-secret", answers: { id: "two", apiKey: "two" }, options: {} },
        })).rejects.toThrow(/already used/);

        expect(await sources.getSource("urn:two")).toBeNull();
        expect(await secrets.get("SHARED_API_KEY")).toBe("one");
    });

    test("deletes obsolete secret keys after a rerun changes a key template input", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();
        const definition = envSecretDefinition();

        const created = await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [definition],
            dto: {
                kind: "env-secret",
                answers: { id: "main", environment: "dev", apiKey: "dev-secret" },
                options: {},
            },
        });

        const oldKey = created.instance.secretRefs.apiKey;
        expect(await secrets.get(oldKey)).toBe("dev-secret");

        const rerun = await runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "env-secret:main",
            body: { answers: { environment: "prod", apiKey: "prod-secret" } },
        });

        const newKey = rerun.instance.secretRefs.apiKey;
        expect(newKey).toBe("TOKEN_PROD");
        expect(await secrets.get(newKey)).toBe("prod-secret");
        expect(await secrets.get(oldKey)).toBeNull();
    });
});

function sharedSecretDefinition(): IntegrationDefinition {
    return {
        kind: "shared-secret",
        label: "Shared Secret",
        inputs: secretInputs(),
        secrets: [{ input: "apiKey", key: "SHARED_API_KEY" }],
        artifacts: [sourceArtifact("{{answers.id}}")],
    };
}

function envSecretDefinition(): IntegrationDefinition {
    return {
        kind: "env-secret",
        label: "Env Secret",
        inputs: [
            ...secretInputs(),
            { name: "environment", label: "Environment", type: "text", required: true },
        ],
        secrets: [{ input: "apiKey", key: "TOKEN_{{env answers.environment}}" }],
        artifacts: [sourceArtifact("{{answers.id}}")],
    };
}

function secretInputs(): IntegrationDefinition["inputs"] {
    return [
        { name: "id", label: "ID", type: "text", required: true },
        { name: "apiKey", label: "API Key", type: "password", required: true, secret: true },
    ];
}
