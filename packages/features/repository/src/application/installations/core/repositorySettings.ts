import type { InstallationServices } from "repository/application/installations/interfaces/services";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import { initializationAdministrator } from "repository/application/installations/core/initialization";
import { InstallationError } from "repository/application/installations/core/errors";
export async function authorizeRepositorySettings({
    services,
    context,
    input,
}: {
    services: InstallationServices;
    context: ProviderCapabilityInvocationContext;
    input?: unknown;
}) {
    await initializationAdministrator(services, context);
    repositorySettings(services, context);
    if (input && typeof input === "object" && "url" in input && typeof input.url === "string") {
        normalizeRepositoryAddress(input.url);
    }
}
export function repositorySettings(services: InstallationServices, context: ProviderCapabilityInvocationContext) {
    if (!services.repositorySettings) {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    if (services.repositorySettings.siteId !== context.siteId) {
        throw new InstallationError("NOT_FOUND");
    }
    return services.repositorySettings;
}

/** URL-only settings never contain credentials, a token query, or a fragment. */
export function normalizeRepositoryAddress(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new InstallationError("INVALID_INPUT");
    }
    if (
        value.length > 2048 ||
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new InstallationError("INVALID_INPUT");
    }
    return url.origin;
}
