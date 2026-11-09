import { HostingError } from "hosting/core/errors";
import { domainHostname } from "hosting/core/origin";
import type { HostingDomain } from "hosting/interfaces/state";
import type { HostingDomainStore, HostingInstanceReader } from "hosting/interfaces/stores";

/** Public read-only permission; it grants certificate issuance, never CMS execution. */
export class DomainTlsAuthority {
    private pending = 0;
    constructor(
        private readonly store: Pick<HostingDomainStore, "getDomain">,
        private readonly instances: HostingInstanceReader,
        private readonly configured: (domain: HostingDomain) => Promise<boolean>,
        private readonly maxPending = 16,
    ) {
        if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 256) {
            throw new TypeError("TLS permission pending bound is invalid");
        }
    }
    async permit(hostname: string): Promise<void> {
        hostname = domainHostname(hostname);
        if (this.pending >= this.maxPending) {
            throw new HostingError("UNAVAILABLE", "TLS permission capacity is exhausted");
        }
        this.pending++;
        try {
            const domain = await this.store.getDomain(hostname);
            if (!domain || !["verified", "active"].includes(domain.state) || !domain.origin.startsWith("https:")) {
                throw new HostingError("FORBIDDEN", "Domain is not eligible for TLS");
            }
            const instance = await this.instances.getInstance(domain.instanceId);
            if (!instance || instance.status !== "ready" || !(await this.configured(domain))) {
                throw new HostingError("FORBIDDEN", "Domain is not routed to this installation");
            }
            const [current, target] = await Promise.all([
                this.store.getDomain(hostname),
                this.instances.getInstance(domain.instanceId),
            ]);
            if (
                !current ||
                current.revision !== domain.revision ||
                current.instanceId !== domain.instanceId ||
                current.origin !== domain.origin ||
                !["verified", "active"].includes(current.state) ||
                !target ||
                target.status !== "ready" ||
                target.revision !== instance.revision
            ) {
                throw new HostingError("FORBIDDEN", "Domain authority changed during verification");
            }
        } finally {
            this.pending--;
        }
    }
}
