import { CoreCapabilityDispatchError, type TSystem } from "@bernouy/cms-content";
import type { IdentityProvider, TUser } from "@bernouy/cms-auth";
import type { CoreCapabilityInvocationContext } from "@bernouy/cms-content";
import type { ProductionGateway } from "../../gateway/createProductionGateway";

export function projectSite(system: TSystem, revision: number) {
    return {
        revision,
        name: system.site.name,
        host: system.site.host,
        language: system.site.language,
        visible: system.site.visible,
    };
}

export function projectUser(user: TUser, administrator: boolean) {
    return {
        sub: user.sub,
        ...(user.email ? { email: user.email } : {}),
        ...(user.provider ? { provider: user.provider } : {}),
        administrator,
        createdAt: user.createdAt.toISOString(),
        lastSeenAt: user.lastSeenAt.toISOString(),
    };
}

export function projectIdentityProvider(provider: IdentityProvider) {
    return {
        id: provider.id,
        revision: provider.revision,
        kind: provider.kind,
        displayName: provider.displayName,
        enabled: provider.enabled,
        ...(provider.icon ? { icon: provider.icon } : {}),
        ...(provider.issuer ? { issuer: provider.issuer } : {}),
        ...(provider.authorizationEndpoint ? { authorizationEndpoint: provider.authorizationEndpoint } : {}),
        ...(provider.tokenEndpoint ? { tokenEndpoint: provider.tokenEndpoint } : {}),
        ...(provider.jwksUri ? { jwksUri: provider.jwksUri } : {}),
        ...(provider.clientId ? { clientId: provider.clientId } : {}),
        ...(provider.scopes ? { scopes: provider.scopes } : {}),
        createdAt: provider.createdAt.toISOString(),
        updatedAt: provider.updatedAt.toISOString(),
    };
}

export async function administratorState(gateway: ProductionGateway | undefined, sub: string) {
    return gateway ? gateway.administrators.get(sub) : { sub, enabled: false, revision: 0, bootstrap: false };
}

export async function actorSubject(
    gateway: ProductionGateway,
    context: CoreCapabilityInvocationContext,
): Promise<string> {
    if (!context.providerSubjectId) {
        throw new CoreCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
    }
    const installation = await gateway.installations.get({
        siteId: gateway.siteId,
        installationId: context.installationId,
    });
    if (!installation) {
        throw new CoreCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
    }
    const sub = await gateway.identities.resolve(
        { providerId: installation.installation.providerId },
        context.providerSubjectId,
    );
    if (!sub) {
        throw new CoreCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
    }
    return sub;
}

export async function accessCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 409) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        const message = String(error);
        if (message.includes("unknown provider")) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (message.includes("cannot disable") || message.includes("not editable")) {
            throw new CoreCapabilityDispatchError("INVALID_STATE", 409);
        }
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

export function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.trim();
}

export function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

export function positiveRevision(value: unknown): number {
    const valueRevision = revision(value);
    if (valueRevision < 1) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return valueRevision;
}

export function requiredGateway(gateway: ProductionGateway | undefined): ProductionGateway {
    if (!gateway) {
        throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    return gateway;
}
