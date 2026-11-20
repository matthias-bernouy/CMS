import type { ControlAuthority } from "hosting/core/ControlAuthority";
import type { ElectPrimaryDomain, PrimaryDomainStore, PrimaryInstanceStore } from "hosting/interfaces/primary";
import type { HostingActor, HostingDomain } from "hosting/interfaces/state";
import type { HostingInstanceState } from "hosting/interfaces/stores";
import { HostingError } from "../errors";
import { domainHostname } from "../origin";

/** One instance pointer is the election; the domain reservation fences concurrent disable/TLS writes. */
export class PrimaryDomainManagement {
    constructor(
        private readonly domains: PrimaryDomainStore,
        private readonly instances: PrimaryInstanceStore,
        private readonly authority: Pick<ControlAuthority, "assertAdministrator">,
    ) {}

    async elect(actor: HostingActor, value: ElectPrimaryDomain) {
        await this.authority.assertAdministrator(actor);
        const input = { ...value, hostname: domainHostname(value.hostname) };
        if (
            !Number.isSafeInteger(input.expectedInstanceRevision) ||
            input.expectedInstanceRevision < 1 ||
            !Number.isSafeInteger(input.expectedDomainRevision) ||
            input.expectedDomainRevision < 1
        ) {
            throw new HostingError("INVALID_INPUT", "Expected instance and domain revisions are required");
        }
        let instance = await this.requireInstance(input.instanceId);
        let domain = await this.domains.getDomain(input.hostname);
        assertTarget(domain, instance);
        const pending = await this.domains.getPrimaryElection(input.hostname);
        if (instance.cmsUrl === domain.origin) {
            if (pending) {
                await this.authority.assertAdministrator(actor);
                domain = await this.domains.finishPrimaryElection(pending, true);
            }
            return result(instance, domain);
        }
        if (
            (!pending && instance.revision !== input.expectedInstanceRevision) ||
            domain.revision !== input.expectedDomainRevision
        ) {
            throw new HostingError("CONFLICT", "Instance or domain revision changed");
        }
        const token = crypto.randomUUID();
        let election = pending ?? (await this.domains.reservePrimaryElection({ ...input, token }));
        if (election.token !== token) {
            // An interrupted owner must be fenced before its reservation can be released.
            await this.authority.assertAdministrator(actor);
            instance = await this.requireInstance(input.instanceId);
            let fenced = false;
            if (instance.revision === election.expectedInstanceRevision) {
                instance = await this.instances.setPublicOrigin(instance.id, instance.revision, instance.cmsUrl);
                fenced = true;
            }
            domain = await this.domains.finishPrimaryElection(election, instance.cmsUrl === domain.origin);
            if (instance.cmsUrl === domain.origin) {
                return result(instance, domain);
            }
            if (!fenced || input.expectedInstanceRevision !== election.expectedInstanceRevision) {
                throw new HostingError("CONFLICT", "Interrupted election was superseded");
            }
            election = await this.domains.reservePrimaryElection({
                ...input,
                expectedInstanceRevision: instance.revision,
                expectedDomainRevision: domain.revision,
                token,
            });
            if (election.token !== token) {
                throw new HostingError("CONFLICT", "Another election owns the domain reservation");
            }
        }
        let committed = false;
        let submitted = false;
        try {
            await this.authority.assertAdministrator(actor);
            submitted = true;
            instance = await this.instances.setPublicOrigin(
                instance.id,
                election.expectedInstanceRevision,
                domain.origin,
            );
            committed = true;
            domain = await this.domains.finishPrimaryElection(election, true);
            return result(instance, domain);
        } catch (cause) {
            // An uncertain registry outcome must retain its reservation for a fenced retry.
            if (!submitted || (!committed && cause instanceof HostingError && cause.code === "CONFLICT")) {
                await this.domains.finishPrimaryElection(election, false);
            }
            throw cause;
        }
    }

    private async requireInstance(instanceId: string) {
        const instance = await this.instances.getInstance(instanceId);
        if (!instance) {
            throw new HostingError("NOT_FOUND", "Hosting instance is unavailable");
        }
        if (instance.status !== "ready") {
            throw new HostingError("CONFLICT", "Only a ready instance can elect a primary domain");
        }
        return instance;
    }
}

function assertTarget(domain: HostingDomain | null, instance: HostingInstanceState): asserts domain is HostingDomain {
    if (!domain || domain.instanceId !== instance.id) {
        throw new HostingError("NOT_FOUND", "Domain does not belong to this instance");
    }
    if (domain.state !== "active" || !["ready", "not-required"].includes(domain.tls)) {
        throw new HostingError("DOMAIN_UNVERIFIED", "The primary domain must be active with ready TLS");
    }
}

function result(instance: HostingInstanceState, domain: HostingDomain) {
    return { instanceId: instance.id, origin: instance.cmsUrl, revision: instance.revision, domain };
}
