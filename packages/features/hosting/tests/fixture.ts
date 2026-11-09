import { ControlAuthority, DomainRegistry, reserveHostingInstallation } from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import type { HostingInstanceState } from "@bernouy/hosting";

export async function fixture() {
    const store = new InMemoryHostingStore();
    await reserveHostingInstallation(store, "http://control.localhost");
    await store.bindControl(1, "control-id");
    await store.completeInstallation(2);
    let admin = true;
    let verified = false;
    let probe: (() => Promise<void>) | undefined;
    let domainReads = 0;
    let instanceReads = 0;
    const instances = new Map<string, HostingInstanceState>([
        ["control-id", { id: "control-id", status: "ready", revision: 1, cmsUrl: "http://control.localhost" }],
        ["site-a", { id: "site-a", status: "ready", revision: 1, cmsUrl: "http://control.localhost" }],
        ["site-b", { id: "site-b", status: "ready", revision: 1, cmsUrl: "http://control.localhost" }],
    ]);
    const authority = new ControlAuthority(store, async () => admin);
    const domains = new DomainRegistry(
        {
            getDomain: async (hostname) => {
                domainReads++;
                return store.getDomain(hostname);
            },
            claimDomain: (record) => store.claimDomain(record),
            replaceDomain: (revision, record) => store.replaceDomain(revision, record),
            listDomains: (input) => store.listDomains(input),
            scanDomains: (input) => store.scanDomains(input),
        },
        {
            getInstance: async (id) => {
                instanceReads++;
                return instances.get(id) ?? null;
            },
        },
        authority,
        "a".repeat(32),
        async () => {
            await probe?.();
            return verified;
        },
    );
    return {
        store,
        domains,
        instances,
        authority,
        actor: { instanceId: "control-id", subjectId: "administrator" },
        setAdmin: (value: boolean) => {
            admin = value;
        },
        setVerified: (value: boolean) => {
            verified = value;
        },
        setProbe: (value: () => Promise<void>) => {
            probe = value;
        },
        counts: () => ({ domainReads, instanceReads }),
    };
}
