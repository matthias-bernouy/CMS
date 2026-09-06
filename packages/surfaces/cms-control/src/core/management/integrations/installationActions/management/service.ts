import { publishedPageResolver } from "cms-control/core/management/integrations/publishedPageResolver";
import { executeFunction } from "@bernouy/cms-functions";
import { IntegrationManagementService, IntegrationRuntimeError } from "@bernouy/cms-integrations";
import { createSecretResolver } from "@bernouy/cms-secrets";
import type { ControlCms } from "cms-control/ControlCms";

const services = new WeakMap<ControlCms, IntegrationManagementService>();
export function integrationManagement(cms: ControlCms): IntegrationManagementService {
    const existing = services.get(cms);
    if (existing) {
        return existing;
    }
    const service = new IntegrationManagementService({
        installations: cms.integrationInstallations,
        resolvePublishedPage: publishedPageResolver(cms.repository, cms.config?.deliveryUrl),
        secrets: cms.secrets,
        async invoke(installation, functionId, payload, secrets) {
            const owned = installation.artifacts.some(
                (artifact) => artifact.type === "function" && artifact.id === functionId,
            );
            const fn = owned ? await cms.functions?.getFunction(functionId) : null;
            if (!fn || fn.method !== "POST" || fn.access?.mode !== "system") {
                throw new IntegrationRuntimeError("Integration management function is unavailable", 503);
            }
            const response = await executeFunction(
                fn,
                new Request("https://cms.internal/integrations/management", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                }),
                {
                    sources: cms.sources,
                    deps: { ...cms.sourceExecutorDeps, resolveSecret: createSecretResolver(secrets) },
                    identities: cms.identities,
                    user: payload.actor ?? {},
                },
            );
            if (!response.ok) {
                throw new IntegrationRuntimeError("Integration management request failed", response.status);
            }
            const text = await response.text();
            if (text.length > 1_000_000) {
                throw new IntegrationRuntimeError("Integration management response is too large", 502);
            }
            return JSON.parse(text);
        },
        async syncRuntimeSecrets(installation, values) {
            const bindings = Object.values(installation.connectorBindings ?? {});
            if (bindings.length !== 1) {
                throw new IntegrationRuntimeError(
                    "Runtime secret sync requires exactly one installed connector binding",
                    409,
                );
            }
            const binding = bindings[0]!;
            const deployer = Object.values(cms.integrationConnectorDeployers ?? {}).find(
                ({ provider }) => provider === binding.provider,
            );
            if (!deployer?.syncSecrets) {
                throw new IntegrationRuntimeError("Connector runtime secret synchronization is unavailable", 503);
            }
            await deployer.syncSecrets(binding, values);
        },
    });
    services.set(cms, service);
    return service;
}
