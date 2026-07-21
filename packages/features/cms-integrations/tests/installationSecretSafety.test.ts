import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact } from "./helpers";

describe("@bernouy/cms-integrations installation secret safety", () => {
    test("rejects secret key collisions across tracked installations", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const firstDefinition = sharedSecretDefinition("shared-secret-one");
        const secondDefinition = sharedSecretDefinition("shared-secret-two");

        await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [firstDefinition],
            dto: { kind: "shared-secret-one", answers: { id: "one", apiKey: "one" }, options: {} },
        });

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: { sources, secrets },
                installations,
                siteIntegrations: [secondDefinition],
                dto: { kind: "shared-secret-two", answers: { id: "two", apiKey: "two" }, options: {} },
            }),
        ).rejects.toThrow(/already used/);

        expect(await sources.getSource("urn:two")).toBeNull();
        expect(await secrets.get("SHARED_API_KEY")).toBe("one");
    });

    test("deletes obsolete secret keys after a rerun changes a key template input", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const definition = envSecretDefinition();

        const created = await runIntegrationInstallation({
            mode: "create",
            deps: { sources, secrets },
            installations,
            siteIntegrations: [definition],
            dto: {
                kind: "env-secret",
                answers: { id: "main", environment: "dev", apiKey: "dev-secret" },
                options: {},
            },
        });

        const oldKey = created.installation.secretRefs.apiKey;
        expect(await secrets.get(oldKey)).toBe("dev-secret");

        const rerun = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources, secrets },
            installations,
            integrationId: "env-secret",
            body: { answers: { environment: "prod", apiKey: "prod-secret" } },
        });

        const newKey = rerun.installation.secretRefs.apiKey;
        expect(newKey).toBe("TOKEN_PROD");
        expect(await secrets.get(newKey)).toBe("prod-secret");
        expect(await secrets.get(oldKey)).toBeNull();
    });
});

function sharedSecretDefinition(kind: string): IntegrationDefinition {
    return {
        kind,
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
        inputs: [...secretInputs(), { name: "environment", label: "Environment", type: "text", required: true }],
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
