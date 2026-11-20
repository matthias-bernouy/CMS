import { HostingError } from "hosting/core/errors";
import { readDomain, readInstallation } from "../state";
import type { HostingInstallation, HostingDomain } from "hosting/interfaces/state";
import type { HostingDomainStore, HostingInstallationStore } from "hosting/interfaces/stores";
import type { PrimaryDomainElection } from "hosting/interfaces/primary";

export class InMemoryHostingStore implements HostingDomainStore, HostingInstallationStore {
    private installation: HostingInstallation | null = null;
    private readonly domains = new Map<string, HostingDomain>();
    private readonly primaryElections = new Map<string, PrimaryDomainElection>();

    async readInstallation() {
        return structuredClone(this.installation);
    }

    async reserveInstallation(candidate: HostingInstallation) {
        const record = readInstallation(candidate);
        this.installation ??= record;
        return structuredClone(this.installation);
    }

    async bindControl(expectedRevision: number, instanceId: string) {
        if (!instanceId || !this.installation || this.installation.revision !== expectedRevision) {
            throw new HostingError("CONFLICT", "Hosting installation revision changed");
        }
        if (this.installation.controlInstanceId && this.installation.controlInstanceId !== instanceId) {
            throw new HostingError("CONFLICT", "Control identity is immutable");
        }
        if (this.installation.controlInstanceId === instanceId) {
            return structuredClone(this.installation);
        }
        this.installation = readInstallation({
            ...this.installation,
            controlInstanceId: instanceId,
            phase: "provisioning",
            revision: expectedRevision + 1,
        });
        return structuredClone(this.installation);
    }

    async completeInstallation(expectedRevision: number) {
        if (
            !this.installation ||
            this.installation.phase !== "provisioning" ||
            this.installation.revision !== expectedRevision
        ) {
            throw new HostingError("CONFLICT", "Hosting installation is not awaiting completion at this revision");
        }
        this.installation = readInstallation({ ...this.installation, phase: "ready", revision: expectedRevision + 1 });
        return structuredClone(this.installation);
    }

    async getDomain(hostname: string) {
        return structuredClone(this.domains.get(hostname) ?? null);
    }

    async claimDomain(candidate: HostingDomain) {
        const record = readDomain(candidate);
        const current = this.domains.get(record.hostname);
        if (current) {
            if (
                current.instanceId !== record.instanceId ||
                current.origin !== record.origin ||
                (record.creationFingerprint !== null && current.creationFingerprint !== record.creationFingerprint)
            ) {
                throw new HostingError("CONFLICT", "Domain is already assigned");
            }
            return structuredClone(current);
        }
        if ([...this.domains.values()].some((domain) => domain.claimId === record.claimId)) {
            throw new HostingError("CONFLICT", "Creation request is already assigned to a domain");
        }
        this.domains.set(record.hostname, record);
        return structuredClone(record);
    }

    async replaceDomain(expectedRevision: number, candidate: HostingDomain) {
        const record = readDomain(candidate);
        const current = this.domains.get(record.hostname);
        if (
            !current ||
            this.primaryElections.has(record.hostname) ||
            current.revision !== expectedRevision ||
            record.revision !== expectedRevision + 1 ||
            current.instanceId !== record.instanceId ||
            current.origin !== record.origin ||
            current.claimId !== record.claimId ||
            current.creationFingerprint !== record.creationFingerprint
        ) {
            throw new HostingError("CONFLICT", "Domain revision or ownership changed");
        }
        this.domains.set(record.hostname, record);
        return structuredClone(record);
    }

    async listDomains(input: { instanceId: string; after: string | null; limit: number }) {
        const records = [...this.domains.values()]
            .filter(
                (record) =>
                    record.instanceId === input.instanceId && (input.after === null || record.hostname > input.after),
            )
            .sort((a, b) => (a.hostname < b.hostname ? -1 : a.hostname === b.hostname ? 0 : 1))
            .slice(0, input.limit + 1);
        const items = records.slice(0, input.limit);
        return structuredClone({ items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null });
    }

    async scanDomains(input: { after: string | null; limit: number }) {
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
            throw new HostingError("INVALID_INPUT", "Invalid domain page limit");
        }
        const records = [...this.domains.values()]
            .filter((record) => input.after === null || record.hostname > input.after)
            .sort((a, b) => (a.hostname < b.hostname ? -1 : a.hostname === b.hostname ? 0 : 1))
            .slice(0, input.limit + 1);
        const items = records.slice(0, input.limit);
        return structuredClone({ items, nextCursor: records.length > input.limit ? items.at(-1)!.hostname : null });
    }

    async getPrimaryElection(hostname: string) {
        return structuredClone(this.primaryElections.get(hostname) ?? null);
    }

    async reservePrimaryElection(candidate: PrimaryDomainElection) {
        const pending = this.primaryElections.get(candidate.hostname);
        if (pending) {
            return structuredClone(pending);
        }
        const domain = this.domains.get(candidate.hostname);
        if (
            !domain ||
            domain.instanceId !== candidate.instanceId ||
            domain.state !== "active" ||
            domain.revision !== candidate.expectedDomainRevision
        ) {
            throw new HostingError("CONFLICT", "Domain changed before its election reservation");
        }
        this.primaryElections.set(candidate.hostname, structuredClone(candidate));
        return structuredClone(candidate);
    }

    async finishPrimaryElection(election: PrimaryDomainElection, committed: boolean) {
        const pending = this.primaryElections.get(election.hostname);
        const domain = this.domains.get(election.hostname);
        if (!domain || pending?.token !== election.token) {
            throw new HostingError("CONFLICT", "Primary election reservation changed");
        }
        const result = readDomain({ ...domain, revision: domain.revision + (committed ? 1 : 0) });
        this.domains.set(domain.hostname, result);
        this.primaryElections.delete(domain.hostname);
        return structuredClone(result);
    }
}
