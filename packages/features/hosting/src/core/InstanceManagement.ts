import { HostingError } from "./errors";
import { domainProof } from "./domains/proof";
import type { ControlAuthority } from "./ControlAuthority";
import type { DomainAdmissionPolicy } from "./domains/AdmissionPolicy";
import type { ProviderInstanceLifecycle } from "hosting/instances/core/lifecycle";
import type { ProviderInstanceRecord } from "hosting/instances/interfaces/types";
import type { HostingActor } from "hosting/interfaces/state";
import type { CreateHostedInstance, HostedInstance } from "hosting/interfaces/management";
import type { HostingDomainStore, HostingInstallationStore } from "hosting/interfaces/stores";

export class InstanceManagement {
    constructor(
        private readonly lifecycle: ProviderInstanceLifecycle,
        private readonly domains: HostingDomainStore,
        private readonly installations: HostingInstallationStore,
        private readonly authority: Pick<ControlAuthority, "assertAdministrator">,
        private readonly admission: DomainAdmissionPolicy,
        private readonly proofSecret: string,
    ) {
        if (proofSecret.length < 32) {
            throw new TypeError("Domain proof secret must contain at least 32 characters");
        }
    }

    async create(actor: HostingActor, input: CreateHostedInstance) {
        await this.authority.assertAdministrator(actor);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.requestId)) {
            throw new HostingError("INVALID_INPUT", "A UUID creation request is required");
        }
        const { origin, hostname, local, managed } = this.admission.classify(input.origin);
        const plainHttp = local && origin.startsWith("http:");
        const key = `hosting:${input.requestId.toLowerCase()}`;
        const create = { label: input.label, cmsUrl: origin, administrator: input.administrator };
        const issuer = { kind: "control", actor: { ...actor } } as const;
        const candidate = await this.lifecycle.prepare(key, create, issuer);
        await this.authority.assertAdministrator(actor);
        // Reserve before provisioning: conflicting domains never leave an orphan CMS.
        // claimId is unique across hostnames, fencing reuse of a request with another domain.
        const domain = await this.domains.claimDomain({
            hostname,
            origin,
            instanceId: candidate.id,
            claimId: candidate.id.slice("instance:".length),
            creationFingerprint: candidate.idempotencyFingerprint,
            state: managed ? (plainHttp ? "active" : "verified") : "pending",
            tls: managed && plainHttp ? "not-required" : "pending",
            revision: 1,
        });
        const { instance } = await this.lifecycle.create(key, create, issuer);
        await this.authority.assertAdministrator(actor);
        return {
            instance: projectHostedInstance(instance),
            domain,
            proof: domain.state === "pending" ? domainProof(domain, this.proofSecret) : null,
        };
    }

    async get(actor: HostingActor, instanceId: string) {
        await this.authority.assertAdministrator(actor);
        const instance = await this.lifecycle.get(instanceId);
        if (!instance) {
            throw new HostingError("NOT_FOUND", "Hosting instance is unavailable");
        }
        return projectHostedInstance(instance);
    }

    async list(actor: HostingActor, after: string | null, limit: number) {
        await this.authority.assertAdministrator(actor);
        const page = await this.lifecycle.page(after, limit);
        return { items: page.items.map(projectHostedInstance), nextCursor: page.nextCursor };
    }

    async disable(actor: HostingActor, instanceId: string) {
        await this.authority.assertAdministrator(actor);
        const installation = await this.installations.readInstallation();
        if (!installation || instanceId === installation.controlInstanceId) {
            throw new HostingError("FORBIDDEN", "Control cannot be disabled through tenant management");
        }
        const instance = await this.lifecycle.disable(instanceId);
        if (!instance) {
            throw new HostingError("NOT_FOUND", "Hosting instance is unavailable");
        }
        return projectHostedInstance(instance);
    }
}

function projectHostedInstance(instance: ProviderInstanceRecord): HostedInstance {
    const { id, label, cmsUrl: origin, status, revision, createdAt, updatedAt } = instance;
    return { id, label, origin, status, revision, createdAt, updatedAt };
}
