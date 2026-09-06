import { publishedPageResolver } from "cms-control/core/management/integrations/publishedPageResolver";
import { executeFunction } from "@bernouy/cms-functions";
import {
    IntegrationManagementService,
    IntegrationManagementError,
    IntegrationRuntimeError,
} from "@bernouy/cms-integrations";
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
            let callStatus: number | undefined;
            const response = await executeFunction(
                fn,
                new Request("https://cms.internal/integrations/management", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                }),
                {
                    sources: cms.sources,
                    deps: {
                        ...cms.sourceExecutorDeps,
                        resolveSecret: createSecretResolver(secrets),
                        resolveContext: async () => ({ userID: payload.actor?.id, userRole: payload.actor?.role }),
                    },
                    identities: cms.identities,
                    user: payload.actor ?? {},
                    reportFailure: (failure) => {
                        callStatus = failure.callStatus;
                    },
                },
            );
            const text = await response.text();
            if (text.length > 1_000_000) {
                throw new IntegrationRuntimeError("Integration management response is too large", 502);
            }
            let value: unknown;
            try {
                value = JSON.parse(text);
            } catch {
                if (!response.ok) {
                    throw new IntegrationRuntimeError("Integration management request failed", response.status);
                }
                if (payload.operation === "health") {
                    return null;
                }
                throw new IntegrationRuntimeError("Invalid integration management response", 502);
            }
            if (!response.ok) {
                if (payload.operation === "health" && callStatus && [401, 403, 408, 504].includes(callStatus)) {
                    throw new IntegrationRuntimeError(
                        "Integration health check failed",
                        callStatus === 408 ? 504 : callStatus,
                    );
                }
                const error = value && typeof value === "object" ? (value as { error?: unknown }).error : undefined;
                const message =
                    response.status < 500 && typeof error === "string"
                        ? error.slice(0, 1_000)
                        : "Integration management request failed";
                const code = value && typeof value === "object" ? (value as { code?: unknown }).code : undefined;
                throw new IntegrationManagementError(
                    message,
                    response.status,
                    typeof code === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(code) ? code : undefined,
                );
            }
            return value;
        },
        async syncRuntimeSecrets(installation, values) {
            const ordinaryTargets =
                installation.connectorRuntimeTargets ??
                installation.runs
                    .findLast((run) => run.status === "success")
                    ?.connectors?.filter((connector) => !connector.lineageId)
                    .map((connector) => ({ provider: connector.provider, outputs: connector.outputs ?? {} })) ??
                [];
            const bindings = [...Object.values(installation.connectorBindings ?? {}), ...ordinaryTargets];
            if (bindings.length !== 1) {
                throw new IntegrationRuntimeError(
                    "Runtime secret sync requires exactly one installed connector target",
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
