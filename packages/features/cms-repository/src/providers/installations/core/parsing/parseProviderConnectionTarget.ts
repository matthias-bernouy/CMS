import type { ProviderConnectionTarget } from "cms-repository/providers/installations/interfaces/ProviderConnection";
import { rejectUnknownKeys } from "cms-repository/providers/manifests/core/values";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS, type ProviderInstallationLimits } from "../limits";
import { parseInstallationDocument, parseInstallationJson } from "./documents";
import { parseEndpoint, parseSecretRef } from "./fields";

export function parseProviderConnectionTarget(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderConnectionTarget {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(record, ["endpoint", "providerTokenRef"], "$");
        return {
            endpoint: parseEndpoint(record.endpoint, "$.endpoint"),
            providerTokenRef: parseSecretRef(record.providerTokenRef, "$.providerTokenRef"),
        };
    });
}

export function parseProviderConnectionTargetJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits> = DEFAULT_PROVIDER_INSTALLATION_LIMITS,
): ProviderConnectionTarget {
    return parseInstallationJson(input, limits, (value) => parseProviderConnectionTarget(value, limits));
}
