import type { GatewayAuthorityReads } from "cms-gateway/invocation/core/dispatch/GatewayAuthorityReads";
import { DELEGATION_LIMITS } from "cms-gateway/access/delegation/limits";
import { prepareDelegation } from "./prepareDelegation";
import { validDelegationTicket } from "../wire";
import { ticketHash, fingerprint, selectionFingerprint } from "../ticket";
import { implementation, actorMayInvoke, denied, reviewedDelegation, delegationFence } from "../validation";
import { delegationAllows } from "@bernouy/cms-repository/providers";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { providerInstallationFingerprint } from "../../providers/credentials";
import {
    type DelegationAuthorityOptions,
    type DelegationSource,
    type DelegationTarget,
    type PreparedDelegation,
    type GatewayDelegationAuthority,
} from "../interfaces";

export class DelegationAuthority implements GatewayDelegationAuthority {
    constructor(private readonly options: DelegationAuthorityOptions) {}

    async issue(value: DelegationSource, reads?: GatewayAuthorityReads) {
        const prepared = await this.prepare(value, reads);
        return prepared ? prepared.finalize(value, async (context) => context) : null;
    }

    async prepare(value: DelegationSource, reads?: GatewayAuthorityReads): Promise<PreparedDelegation | null> {
        return prepareDelegation(this.options, value, reads);
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
