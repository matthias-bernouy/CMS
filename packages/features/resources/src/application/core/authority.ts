import type { ResourceServices, ResourceInvocationContext } from "resources/application/interfaces/services";
import { ResourceSetupError } from "./policy";

export function resourceInitialization(services: ResourceServices, context: ResourceInvocationContext) {
    const service = services.resources.initialization;
    if (context.siteId !== service.siteId || context.invocation?.instanceId !== service.instanceId) {
        throw new ResourceSetupError("NOT_FOUND");
    }
    return service;
}
export async function resourceAdministrator(services: ResourceServices, context: ResourceInvocationContext) {
    resourceInitialization(services, context);
    if (!context.subjectId || context.systemServiceId || context.sourceInstallationId || context.controlAuthority) {
        throw new ResourceSetupError("FORBIDDEN");
    }
    const authority = services.resources.administrators;
    const actorId = await authority.resolve(context.providerId, context.subjectId);
    if (!actorId || !(await authority.enabled(actorId))) {
        throw new ResourceSetupError("FORBIDDEN");
    }
    return actorId;
}
export async function authorizeResourceInitialization({
    services,
    context,
}: {
    services: ResourceServices;
    context: ResourceInvocationContext;
}) {
    await resourceAdministrator(services, context);
}
export function resourceExecutionGuard(context: ResourceInvocationContext) {
    if (!context.signal) {
        throw new ResourceSetupError("CORE_UNAVAILABLE");
    }
    return { signal: context.signal, assertHeld: () => context.signal!.throwIfAborted() };
}
