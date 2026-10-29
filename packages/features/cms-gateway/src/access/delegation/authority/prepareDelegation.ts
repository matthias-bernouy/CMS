import type { GatewayAuthorityReads } from "cms-gateway/invocation/core/dispatch/GatewayAuthorityReads";
import type { DelegationAuthorityOptions, DelegationSource, PreparedDelegation } from "../interfaces";
import { DELEGATION_LIMITS } from "../limits";
import { fingerprint, selectionFingerprint, ticketHash } from "../ticket";
import { actorMayInvoke, denied, implementation, isDelegationActor } from "../validation";
import { randomBytes } from "node:crypto";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { providerInstallationFingerprint } from "../../providers/credentials";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

/** Persist only a hash; disclose the bearer once, after the final authority-owned actor check. */
export async function prepareDelegation(
    options: DelegationAuthorityOptions,
    value: DelegationSource,
    reads?: GatewayAuthorityReads,
): Promise<PreparedDelegation | null> {
    const source = structuredClone(value);
    if (source.siteId !== options.siteId || !isDelegationActor(source.actor)) {
        return denied();
    }
    const now = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(source.deadline) || source.deadline <= now) {
        return denied();
    }
    const route = await options.routes.resolve(source.siteId, source.contractId, reads);
    if (
        !route ||
        route.selection.installationId !== source.installationId ||
        route.selection.digest !== source.digest ||
        route.requestedRelease.admission.release.version !== source.version
    ) {
        return denied();
    }
    const capability = route.requestedRelease.admission.release.capabilities.find(
        ({ id }) => id === source.capabilityId,
    );
    const policy = implementation(route)?.delegation;
    if (!capability || !policy || (!policy.sources.includes("*") && !policy.sources.includes(capability.id))) {
        return null;
    }
    const current = await (reads
        ? reads.selection(options.selections, source.siteId)
        : options.selections.get(source.siteId));
    if (
        !current ||
        !actorMayInvoke(source.actor, capability.access) ||
        !capabilityGranted(current.grants, route.selection.contractId, capability.id)
    ) {
        return denied();
    }
    const credentialFingerprint = await options.credentialFingerprint(route);
    if (!credentialFingerprint) {
        return denied();
    }
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = Math.min(source.deadline, now + DELEGATION_LIMITS.lifetimeMs);
    const created = await options.store.create(
        {
            hash: ticketHash(ticket),
            siteId: source.siteId,
            source,
            installationFingerprint: providerInstallationFingerprint(route.installation),
            credentialFingerprint,
            selectionFingerprint: selectionFingerprint(current),
            actorFingerprint: fingerprint(source.actor),
            expiresAt,
        },
        now,
    );
    if (!created) {
        throw new GatewayError("not_authorized", "delegation capacity exceeded");
    }
    // The bearer stays inside this closure until the final Access inspection succeeds.
    let started = false;
    let cancelled = false;
    let cancellation: Promise<void> | undefined;
    const cancel = () => {
        cancelled = true;
        return (cancellation ??= Promise.resolve().then(() =>
            options.store.close(source.siteId, ticketHash(ticket), source.requestId),
        ));
    };
    return {
        cancel,
        finalize: async (scope, dispatch, expectedRoute) => {
            if (started || cancelled) {
                return denied();
            }
            started = true;
            try {
                for (const key of [
                    "siteId",
                    "requestId",
                    "installationId",
                    "contractId",
                    "version",
                    "digest",
                    "capabilityId",
                ] as const) {
                    if (scope[key] !== source[key]) {
                        return denied();
                    }
                }
                if (
                    expectedRoute &&
                    (fingerprint(expectedRoute.selection) !== fingerprint(route.selection) ||
                        providerInstallationFingerprint(expectedRoute.installation) !==
                            providerInstallationFingerprint(route.installation) ||
                        expectedRoute.installation.observation?.report.instanceId !==
                            route.installation.observation?.report.instanceId ||
                        expectedRoute.manifest.admission.digest !== route.manifest.admission.digest ||
                        expectedRoute.requestedRelease.admission.digest !== route.requestedRelease.admission.digest)
                ) {
                    return denied();
                }
                const actor = await options.inspectActor(source.actor);
                if (
                    !actor ||
                    fingerprint(actor) !== fingerprint(source.actor) ||
                    !actorMayInvoke(actor, capability.access)
                ) {
                    return denied();
                }
                let final;
                if (options.checkAuthority) {
                    final = await options.checkAuthority(route, capability.id);
                } else {
                    const current = await options.routes.isCurrent(route);
                    const selected = await options.selections.get(source.siteId);
                    final = {
                        current,
                        granted: Boolean(
                            selected && capabilityGranted(selected.grants, route.selection.contractId, capability.id),
                        ),
                    };
                }
                if (!final.current || !final.granted || cancelled || expiresAt <= (options.now ?? Date.now)()) {
                    return denied();
                }
                const result = await dispatch(Object.freeze({ ticket, expiresAt }), structuredClone(actor));
                if (cancelled || expiresAt <= (options.now ?? Date.now)()) {
                    return denied();
                }
                return result;
            } catch (error) {
                await cancel().catch(() => undefined);
                throw error;
            }
        },
    };
}
