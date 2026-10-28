import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { SelectionAuthority, AuthorityCapability } from "@bernouy/cms-repository/providers/selections";
import type { GatewayActor, GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";
import type { DelegationActor } from "./interfaces";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export function implementation(route: GatewayRoute) {
    return route.manifest.admission.manifest.implementations.find(
        (item) =>
            item.contractId === route.selection.contractId &&
            item.version === route.selection.version &&
            item.digest === route.selection.digest,
    );
}
export function isDelegationActor(actor: GatewayActor): actor is DelegationActor {
    return (
        actor.kind === "anonymous" ||
        ((actor.kind === "user" || actor.kind === "administrator") && Number.isSafeInteger(actor.authorizationRevision))
    );
}
export function actorMayInvoke(actor: DelegationActor, access: string) {
    return (
        access === "public" ||
        (access === "authenticated" && actor.kind !== "anonymous") ||
        (access === "admin" && actor.kind === "administrator")
    );
}
export function denied(): never {
    throw new GatewayError("not_authorized", "delegation is not authorized");
}

/** Review binds both the concrete selection and the exact artifact owning each capability. */
export function reviewedDelegation(
    authority: SelectionAuthority,
    source: GatewayRoute,
    from: CapabilityDefinition,
    destination: GatewayRoute,
    to: CapabilityDefinition,
): boolean {
    return (
        authority.providers.some(
            (entry) =>
                entry.installationId === source.selection.installationId &&
                entry.manifestDigest === source.manifest.admission.digest,
        ) &&
        authority.delegated.some(
            (entry) => reviewedPin(entry.source, source, from) && reviewedPin(entry.target, destination, to),
        )
    );
}
function reviewedPin(entry: AuthorityCapability, route: GatewayRoute, capability: CapabilityDefinition): boolean {
    const release = route.requestedRelease.admission;
    return (
        entry.selection.siteId === route.selection.siteId &&
        entry.selection.contractId === route.selection.contractId &&
        entry.selection.installationId === route.selection.installationId &&
        entry.selection.digest === route.selection.digest &&
        entry.selection.version === route.selection.version &&
        entry.contractId === release.release.contractId &&
        entry.digest === release.digest &&
        entry.version === release.release.version &&
        entry.capabilityId === capability.id &&
        entry.sensitive === capability.behavior.sensitive &&
        entry.effect === capability.behavior.effect &&
        entry.access === capability.access
    );
}
