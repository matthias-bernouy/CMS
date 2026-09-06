import {
    InMemoryIntegrationInstallationRepository,
    IntegrationManagementService,
    type IntegrationDefinition,
    type IntegrationHealthReport,
    type IntegrationManagementDeps,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
export const definition: IntegrationDefinition = {
    schema: "cms.integration.definition.v2",
    type: "source",
    kind: "test-management",
    label: "Management",
    version: "1.0.0",
    inputs: [],
    generatedSecrets: [{ name: "signing", key: "MANAGED_SIGNING" }],
    management: {
        schemaVersion: 1,
        health: { functionId: "manage" },
        settings: {
            readFunctionId: "manage",
            saveFunctionId: "manage",
            applyFunctionId: "manage",
            fields: [{ id: "key", path: "key", type: "secret-ref", label: "Key" }],
        },
        actions: [{ id: "retry", label: "Retry", functionId: "manage" }],
        generatedSecrets: ["signing"],
        runtimeSecrets: { API_KEY: { field: "key" }, SIGNING_KEY: { generated: "signing" } },
    },
    artifacts: [
        {
            type: "function",
            contractVersion: "1.0.0",
            function: {
                id: "manage",
                method: "POST",
                access: { mode: "system" },
                steps: [],
                return: { status: 200, body: {} },
            },
        },
    ],
};
export function report(now = new Date()): IntegrationHealthReport {
    return {
        schemaVersion: 1,
        status: "ready",
        checkedAt: now.toISOString(),
        configuration: { savedRevision: "1", appliedRevision: "1" },
        checks: [{ id: "connection", status: "ok", actionIds: ["retry"] }],
    };
}
export async function fixture(
    invoke: IntegrationManagementDeps["invoke"],
    extra: Partial<IntegrationManagementDeps> = {},
) {
    const installations = new InMemoryIntegrationInstallationRepository();
    const secrets = new InMemorySecretStore();
    await secrets.set("MANAGED_SIGNING", "old-signing");
    await secrets.set("SELECTED_KEY", "selected-private-value");
    await secrets.set("OTHER_KEY", "other-private-value");
    await installations.create({
        id: definition.kind,
        label: definition.label,
        definitionVersion: "1.0.0",
        definitionSnapshot: definition,
        status: "success",
        answersSnapshot: {},
        secretRefs: { signing: "MANAGED_SIGNING" },
        secretInputs: ["signing"],
        artifacts: [{ id: "manage", type: "function", action: "created" }],
    });
    const deps: IntegrationManagementDeps = { installations, secrets, invoke, ...extra };
    return { installations, secrets, deps, service: new IntegrationManagementService(deps) };
}
