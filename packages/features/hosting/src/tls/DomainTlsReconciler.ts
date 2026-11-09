import { HostingError } from "hosting/core/errors";
import type { DomainRegistry } from "hosting/core/domains/DomainRegistry";
import type { HostingDomainStore } from "hosting/interfaces/stores";
import type { HostingDomain } from "hosting/interfaces/state";
import type { DomainTlsAuthority } from "./DomainTlsAuthority";

/** Bounded background pages; never runs on ordinary Edge ingress. */
export class DomainTlsReconciler {
    private cursor: string | null = null;
    private running?: Promise<void>;
    constructor(
        private readonly store: Pick<HostingDomainStore, "scanDomains">,
        private readonly authority: Pick<DomainTlsAuthority, "permit">,
        private readonly registry: Pick<DomainRegistry, "recordTls">,
        private readonly probe: (domain: HostingDomain, signal: AbortSignal) => Promise<boolean>,
        private readonly report: (
            hostname: string,
            outcome: "ready" | "configuration" | "certificate" | "changed" | "unavailable",
        ) => void,
    ) {}

    batch(signal: AbortSignal): Promise<void> {
        if (signal.aborted) {
            return Promise.resolve();
        }
        if (!this.running) {
            this.running = this.execute(signal).finally(() => {
                this.running = undefined;
            });
        }
        return this.running;
    }
    async drain(): Promise<void> {
        await this.running;
    }
    private async execute(signal: AbortSignal) {
        const page = await this.store.scanDomains({ after: this.cursor, limit: 50 });
        let offset = 0;
        const worker = async () => {
            while (!signal.aborted && offset < page.items.length) {
                const domain = page.items[offset++]!;
                if (!["verified", "active"].includes(domain.state) || !domain.origin.startsWith("https:")) {
                    continue;
                }
                await this.reconcile(domain, signal);
            }
        };
        await Promise.all(Array.from({ length: 4 }, worker));
        if (!signal.aborted) {
            this.cursor = page.nextCursor;
        }
    }
    private async reconcile(domain: HostingDomain, signal: AbortSignal) {
        let outcome: "ready" | "configuration" | "certificate" = "configuration";
        try {
            try {
                await this.authority.permit(domain.hostname);
                if (signal.aborted) {
                    return;
                }
                outcome = (await this.probe(domain, signal)) ? "ready" : "certificate";
            } catch (cause) {
                if (!(cause instanceof HostingError && cause.code === "FORBIDDEN")) {
                    throw cause;
                }
            }
            if (signal.aborted) {
                return;
            }
            await this.registry.recordTls(domain.hostname, domain.revision, outcome === "ready" ? "ready" : "failed");
            this.report(domain.hostname, outcome);
        } catch (cause) {
            this.report(
                domain.hostname,
                cause instanceof HostingError && ["CONFLICT", "NOT_FOUND"].includes(cause.code)
                    ? "changed"
                    : "unavailable",
            );
        }
    }
}
