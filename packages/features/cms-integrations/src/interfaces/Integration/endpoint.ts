import type { IntegrationResolvedPage } from "../IntegrationImport";
import type { IntegrationManagementActor } from "./management";

/** Trusted context supplied only to installed admin Source endpoints. */
export type IntegrationEndpointContext = {
    installationId: string;
    definitionVersion: string;
    actor?: IntegrationManagementActor;
    secretValues: Record<string, string>;
    generatedSecretValues: Record<string, string>;
    resolvedPages: Record<string, IntegrationResolvedPage>;
    continuation?: Record<string, unknown>;
};

/** Private `_cms` result consumed by the server, never exposed to browser binding. */
export type IntegrationEndpointEffects = {
    rememberSecrets?: true;
    generatedSecrets?: Record<string, string>;
    syncRuntime?: true;
    continue?: Record<string, unknown>;
};
