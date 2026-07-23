import { secretKeyToRef } from "@bernouy/cms-secrets";
import { type TemplateContext } from "../../definitions/templates";
import { buildConnectorDeployments, previewConnectorOutputs } from "../connectorDeployments";
import { resolveDependencyContext } from "../dependencies";
import { buildProvisionDeployments, provisionIntegrationResources } from "../provisionDeployments";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../../interfaces/IntegrationImport";
import {
    assertUniqueSecretWrites,
    buildGeneratedSecretWrites,
    buildInputSecretWrites,
    sensitiveInputs,
} from "./secrets";

export async function prepareDeclarativeIntegration(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
) {
    const dependencies = await resolveDependencyContext(definition, deps.installations);
    const secretInputNames = sensitiveInputs(definition);
    const inputSecretWrites = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecretWrites = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, true);
    const initialSecretWrites = [...inputSecretWrites, ...generatedSecretWrites];
    const initialContext = contextForSecrets(
        answers,
        dependencies,
        secretInputNames,
        generatedSecretWrites,
        initialSecretWrites,
    );
    const connectorSecrets = Object.fromEntries(initialSecretWrites.map((secret) => [secret.input, secret.value]));
    const connectorOutputs = await previewConnectorOutputs(deps, definition, {
        ...initialContext,
        connectorSecrets,
    });
    const provisionDeployments = buildProvisionDeployments(definition, {
        ...initialContext,
        connectorSecrets,
        connectors: connectorOutputs,
    });
    const provisions = await provisionIntegrationResources(deps, provisionDeployments);
    try {
        const secretWrites = [...initialSecretWrites, ...provisions.secretWrites];
        assertUniqueSecretWrites(secretWrites);
        const baseContext = contextForSecrets(
            answers,
            dependencies,
            secretInputNames,
            generatedSecretWrites,
            secretWrites,
        );
        const deployments = buildConnectorDeployments(definition, {
            ...baseContext,
            connectors: connectorOutputs,
            connectorSecrets: Object.fromEntries(secretWrites.map((secret) => [secret.input, secret.value])),
        });
        return { baseContext, deployments, provisions, secretWrites };
    } catch (error) {
        await provisions.rollback();
        throw error;
    }
}

function contextForSecrets(
    answers: TemplateContext["answers"],
    dependencies: NonNullable<TemplateContext["dependencies"]>,
    secretInputNames: ReadonlySet<string>,
    generated: Array<{ input: string; value: string }>,
    secrets: Array<{ input?: string; key: string }>,
): TemplateContext {
    return {
        answers,
        secrets: Object.fromEntries(
            secrets.filter((secret) => secret.input).map((secret) => [secret.input!, secretKeyToRef(secret.key)]),
        ),
        dependencies,
        generated: Object.fromEntries(generated.map((secret) => [secret.input, secret.value])),
        secretInputs: secretInputNames,
    };
}
