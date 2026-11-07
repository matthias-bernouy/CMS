import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { InstallationServices } from "repository/application/installations/interfaces/services";
import { InstallationError } from "repository/application/installations/core/errors";
export function initializationService(services: InstallationServices, context: ProviderCapabilityInvocationContext) {
    const service = services.initialization;
    if (!service) {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    if (context.siteId !== service.siteId) {
        throw new InstallationError("NOT_FOUND");
    }
    return service;
}
export async function initializationAdministrator(
    services: InstallationServices,
    context: ProviderCapabilityInvocationContext,
) {
    const gateway = services.gateway;
    if (
        !context.subjectId ||
        context.systemServiceId ||
        context.sourceInstallationId ||
        context.controlAuthority ||
        !gateway?.administrators
    ) {
        throw new InstallationError("FORBIDDEN");
    }
    const sub = await gateway.identities.resolve({ providerId: context.providerId }, context.subjectId);
    if (!sub || !(await gateway.administrators.get(sub)).enabled) {
        throw new InstallationError("FORBIDDEN");
    }
    return sub;
}
export function initializationDigestInput(value: string) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
        throw new InstallationError("INVALID_INPUT");
    }
    return value;
}
/** Runs before queue/receipt access and again in recovered workers. */
export async function authorizeInitialization({
    services,
    context,
    input,
}: {
    services: InstallationServices;
    context: ProviderCapabilityInvocationContext;
    input: { planDigest: string };
}) {
    await initializationAdministrator(services, context);
    initializationService(services, context);
    initializationDigestInput(input.planDigest);
}
export async function readInitializationStatus(
    services: InstallationServices,
    context: ProviderCapabilityInvocationContext,
) {
    await initializationAdministrator(services, context);
    const state = await initializationService(services, context).status();
    const operation =
        services.operations && ["pending", "running"].includes(state.status)
            ? await services.operations.initialization(context.siteId)
            : { operationId: "", operationStatus: "none" as const, errorMessage: "" };
    return { ...state, ...operation };
}

export function initializationExecution(context: ProviderCapabilityInvocationContext) {
    const signal = context.signal;
    if (!signal) {
        throw new InstallationError("CORE_UNAVAILABLE");
    }
    return { signal, assertHeld: () => signal.throwIfAborted() };
}
