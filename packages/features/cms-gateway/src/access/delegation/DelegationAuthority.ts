import type { GatewayAuthorityReads } from "cms-gateway/invocation/core/dispatch/GatewayAuthorityReads";
import { DELEGATION_LIMITS } from "cms-gateway/access/delegation/limits";
import { validDelegationTicket } from "./wire";
import { ticketHash, fingerprint, selectionFingerprint } from "./ticket";
import {
    implementation,
    isDelegationActor,
    actorMayInvoke,
    denied,
    reviewedDelegation,
    delegationFence,
} from "./validation";
import { randomBytes } from "node:crypto";
import { delegationAllows } from "@bernouy/cms-repository/providers";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { providerInstallationFingerprint } from "../providers/credentials";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import {
    type DelegationAuthorityOptions,
    type DelegationSource,
    type DelegationTarget,
    type GatewayDelegationAuthority,
} from "./interfaces";

export class DelegationAuthority implements GatewayDelegationAuthority {
    constructor(private readonly options: DelegationAuthorityOptions) {}

    async issue(value: DelegationSource, reads?: GatewayAuthorityReads) {
        const source = structuredClone(value);
        if (source.siteId !== this.options.siteId || !isDelegationActor(source.actor)) {
            return denied();
        }
        const now = this.now();
        if (!Number.isSafeInteger(source.deadline) || source.deadline <= now) {
            return denied();
        }
        const route = await this.options.routes.resolve(source.siteId, source.contractId, reads);
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
            ? reads.selection(this.options.selections, source.siteId)
            : this.options.selections.get(source.siteId));
        const actor = await this.options.inspectActor(source.actor);
        if (
            !current ||
            !actor ||
            fingerprint(actor) !== fingerprint(source.actor) ||
            !actorMayInvoke(actor, capability.access) ||
            !capabilityGranted(current.grants, route.selection.contractId, capability.id) ||
            !(await this.options.routes.isCurrent(route))
        ) {
            return denied();
        }
        const credentialFingerprint = await this.options.credentialFingerprint(route);
        if (!credentialFingerprint) {
            return denied();
        }
        const ticket = randomBytes(32).toString("base64url");
        const expiresAt = Math.min(source.deadline, now + DELEGATION_LIMITS.lifetimeMs);
        const created = await this.options.store.create(
            {
                hash: ticketHash(ticket),
                siteId: source.siteId,
                source,
                installationFingerprint: providerInstallationFingerprint(route.installation),
                credentialFingerprint,
                selectionFingerprint: selectionFingerprint(current),
                actorFingerprint: fingerprint(actor),
                expiresAt,
            },
            now,
        );
        if (!created) {
            throw new GatewayError("not_authorized", "delegation capacity exceeded");
        }
        return { ticket, expiresAt };
    }

    async check(value: DelegationTarget, consume = false, bytes = 0) {
        const { actor, rootRequestId } = await this.checkState(value, consume, bytes);
        return { actor, rootRequestId };
    }

    authorize(value: DelegationTarget, bytes: number) {
        return this.checkState(value, true, bytes);
    }

    private async checkState(value: DelegationTarget, consume: boolean, bytes: number) {
        const target = structuredClone(value);
        if (
            target.siteId !== this.options.siteId ||
            !validDelegationTicket(target.ticket) ||
            !Number.isSafeInteger(bytes) ||
            bytes < 0 ||
            bytes > DELEGATION_LIMITS.requestBytes
        ) {
            return denied();
        }
        const record = await this.options.store.get(target.siteId, ticketHash(target.ticket), this.now());
        if (
            !record ||
            record.expiresAt <= this.now() ||
            record.source.installationId !== target.sourceInstallationId ||
            record.credentialFingerprint !== target.sourceCredentialFingerprint
        ) {
            return denied();
        }
        const [source, destination, current, actor] = await Promise.all([
            this.options.routes.resolve(target.siteId, record.source.contractId),
            this.options.routes.resolve(target.siteId, target.contractId),
            this.options.selections.get(target.siteId),
            this.options.inspectActor(record.source.actor),
        ]);
        if (
            !source ||
            !destination ||
            !current ||
            !actor ||
            source.installation.installation.status !== "enabled" ||
            destination.installation.installation.status !== "enabled" ||
            providerInstallationFingerprint(source.installation) !== record.installationFingerprint ||
            (await this.options.credentialFingerprint(source)) !== record.credentialFingerprint ||
            selectionFingerprint(current) !== record.selectionFingerprint ||
            fingerprint(actor) !== record.actorFingerprint ||
            source.selection.digest !== record.source.digest ||
            source.selection.installationId !== record.source.installationId
        ) {
            return denied();
        }
        const from = source.requestedRelease.admission.release.capabilities.find(
            ({ id }) => id === record.source.capabilityId,
        );
        const to = destination.requestedRelease.admission.release.capabilities.find(
            ({ id }) => id === target.capabilityId,
        );
        if (
            !from ||
            !to ||
            !actorMayInvoke(actor, from.access) ||
            !actorMayInvoke(actor, to.access) ||
            !capabilityGranted(current.grants, source.selection.contractId, from.id) ||
            !capabilityGranted(current.grants, destination.selection.contractId, to.id) ||
            !reviewedDelegation(current.plan.authority, source, from, destination, to) ||
            !delegationAllows(implementation(source)?.delegation, from, target.contractId, to) ||
            !(await this.options.routes.isCurrent(source)) ||
            !(await this.options.routes.isCurrent(destination))
        ) {
            return denied();
        }
        if (consume && !(await this.options.store.consume(target.siteId, record.hash, this.now(), bytes))) {
            return denied();
        }
        // Check closure/expiry again after asynchronous authorization and quota work.
        if (!(await this.options.store.get(target.siteId, record.hash, this.now()))) {
            return denied();
        }
        return {
            actor,
            rootRequestId: record.source.requestId,
            assertCurrent: delegationFence(this.options, record, source, destination),
        };
    }

    async close(input: { siteId: string; ticket: string; requestId: string }) {
        if (input.siteId !== this.options.siteId || !validDelegationTicket(input.ticket)) {
            return denied();
        }
        await this.options.store.close(input.siteId, ticketHash(input.ticket), input.requestId);
    }
    private now() {
        return (this.options.now ?? Date.now)();
    }
}
