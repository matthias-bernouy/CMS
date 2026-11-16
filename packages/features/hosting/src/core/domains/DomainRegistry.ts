import { randomUUID } from "node:crypto";
import { HostingError } from "../errors";
import { domainHostname, hostingOrigin } from "../origin";
import { domainProof } from "./proof";
import type { ControlAuthority } from "../ControlAuthority";
import type { HostingActor, HostingDomain, DomainTlsState } from "hosting/interfaces/state";
import type { HostingDomainStore, HostingInstanceReader } from "hosting/interfaces/stores";
import type { DomainAdmissionPolicy } from "./AdmissionPolicy";

export class DomainRegistry {
    constructor(
        private readonly store: HostingDomainStore,
        private readonly instances: HostingInstanceReader,
        private readonly authority: Pick<ControlAuthority, "assertAdministrator" | "assertDomainCanBeDisabled">,
        private readonly proofSecret: string,
        private readonly verifyTxt: (name: string, value: string) => Promise<boolean>,
        private readonly admission?: DomainAdmissionPolicy,
    ) {
        if (proofSecret.length < 32) {
            throw new TypeError("Domain proof secret must contain at least 32 characters");
        }
    }

    async claim(actor: HostingActor, instanceId: string, publicOrigin: string) {
        await this.authority.assertAdministrator(actor);
        await this.requireInstance(instanceId);
        const { origin, hostname } = hostingOrigin(publicOrigin);
        const classified = await this.admission?.admit(publicOrigin, actor);
        const managed = classified?.managed === true;
        const plainHttp = managed && classified.local && origin.startsWith("http:");
        const domain = await this.store.claimDomain({
            hostname,
            origin,
            instanceId,
            claimId: randomUUID(),
            creationFingerprint: null,
            state: managed ? (plainHttp ? "active" : "verified") : "pending",
            tls: plainHttp ? "not-required" : "pending",
            revision: 1,
        });
        return { domain, proof: domainProof(domain, this.proofSecret) };
    }

    async verify(actor: HostingActor, hostname: string, expectedRevision: number) {
        await this.authority.assertAdministrator(actor);
        const current = await this.requireDomain(hostname, expectedRevision);
        if (current.state !== "pending") {
            throw new HostingError("CONFLICT", "Only a pending claim can be verified");
        }
        const proof = domainProof(current, this.proofSecret);
        if (!(await this.verifyTxt(proof.name, proof.value))) {
            throw new HostingError("DOMAIN_UNVERIFIED", "The exact domain ownership TXT record is missing");
        }
        await this.authority.assertAdministrator(actor);
        await this.requireInstance(current.instanceId);
        return this.store.replaceDomain(expectedRevision, {
            ...current,
            state: "verified",
            revision: expectedRevision + 1,
        });
    }

    async disable(actor: HostingActor, hostname: string, expectedRevision: number) {
        await this.authority.assertAdministrator(actor);
        const current = await this.requireDomain(hostname, expectedRevision);
        await this.authority.assertDomainCanBeDisabled(actor, current);
        return this.store.replaceDomain(expectedRevision, {
            ...current,
            state: "disabled",
            revision: expectedRevision + 1,
        });
    }

    async list(actor: HostingActor, instanceId: string, after: string | null, limit: number) {
        await this.authority.assertAdministrator(actor);
        await this.requireInstance(instanceId);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
            throw new HostingError("INVALID_INPUT", "Domain page limit must be between 1 and 50");
        }
        return this.store.listDomains({ instanceId, after: after === null ? null : domainHostname(after), limit });
    }

    /** Deployment-only registration: never expose this as an ordinary tenant capability. */
    async registerManaged(instanceId: string, publicOrigin: string) {
        await this.requireInstance(instanceId);
        const { origin, hostname, local } = hostingOrigin(publicOrigin);
        const plainHttp = local && origin.startsWith("http:");
        return this.store.claimDomain({
            hostname,
            origin,
            instanceId,
            claimId: randomUUID(),
            creationFingerprint: null,
            state: plainHttp ? "active" : "verified",
            tls: plainHttp ? "not-required" : "pending",
            revision: 1,
        });
    }

    /** Deployment-owned reconciliation only; never a public or tenant mutation. */
    async recordTls(hostname: string, expectedRevision: number, tls: Exclude<DomainTlsState, "not-required">) {
        const current = await this.requireDomain(hostname, expectedRevision);
        if (current.state !== "verified" && current.state !== "active") {
            throw new HostingError("CONFLICT", "TLS cannot activate an unverified or disabled domain");
        }
        const instance = await this.requireInstance(current.instanceId);
        if (tls === "ready" && instance.status !== "ready") {
            throw new HostingError("CONFLICT", "TLS cannot activate an instance before provisioning is ready");
        }
        if (current.tls === tls) {
            return current;
        }
        return this.store.replaceDomain(expectedRevision, {
            ...current,
            tls,
            state: tls === "ready" ? "active" : "verified",
            revision: expectedRevision + 1,
        });
    }

    async resolve(hostname: string) {
        const domain = await this.store.getDomain(domainHostname(hostname));
        if (!domain || domain.state !== "active") {
            return null;
        }
        const instance = await this.instances.getInstance(domain.instanceId);
        return instance?.status === "ready"
            ? {
                  origin: domain.origin,
                  canonicalOrigin: instance.cmsUrl,
                  instanceId: instance.id,
                  domainRevision: domain.revision,
                  instanceRevision: instance.revision,
              }
            : null;
    }

    private async requireDomain(hostname: string, revision: number): Promise<HostingDomain> {
        const domain = await this.store.getDomain(domainHostname(hostname));
        if (!domain) {
            throw new HostingError("NOT_FOUND", "Domain is not registered");
        }
        if (!Number.isSafeInteger(revision) || domain.revision !== revision) {
            throw new HostingError("CONFLICT", "Domain revision changed");
        }
        return domain;
    }

    private async requireInstance(instanceId: string) {
        const instance = await this.instances.getInstance(instanceId);
        if (!instance || instance.status === "disabled") {
            throw new HostingError("NOT_FOUND", "Hosting instance is unavailable");
        }
        return instance;
    }
}
