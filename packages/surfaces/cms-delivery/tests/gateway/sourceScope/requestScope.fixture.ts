import { InMemoryIdentityService, type IdentityAlias, type IdentityValue } from "@bernouy/cms-gateway/identity";
import { InMemorySourceRepository, type Source } from "@bernouy/cms-sources";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { createDeliverySourceRequestScope } from "cms-delivery/core/sources/requestScope";

export type ScopeCounters = {
    sourceReads: number;
    endpointReads: number;
    identityReads: number;
    secretReads: number;
};

export async function requestScopeHarness() {
    const counters: ScopeCounters = {
        sourceReads: 0,
        endpointReads: 0,
        identityReads: 0,
        secretReads: 0,
    };
    const sources = new CountingSources(counters);
    const identities = new CountingIdentities(counters);
    await sources.createSource(CATALOG_SOURCE);
    const delivery = {
        sources,
        identities,
        sourceResolveSecret: async () => {
            counters.secretReads += 1;
            return "request-secret";
        },
    } as unknown as DeliveryCms;
    return {
        counters,
        delivery,
        endpoint: CATALOG_SOURCE.endpoints[0]!,
        scope: (request: Request) => createDeliverySourceRequestScope(delivery, request),
    };
}

class CountingSources extends InMemorySourceRepository {
    constructor(private readonly counters: ScopeCounters) {
        super();
    }
    override async getSource(urn: string) {
        this.counters.sourceReads += 1;
        return super.getSource(urn);
    }
    override async getEndpoint(urn: string) {
        this.counters.endpointReads += 1;
        return super.getEndpoint(urn);
    }
}

class CountingIdentities extends InMemoryIdentityService {
    constructor(private readonly counters: ScopeCounters) {
        super();
    }
    override async resolve(alias: IdentityAlias, authority: string): Promise<IdentityValue | null> {
        this.counters.identityReads += 1;
        return super.resolve(alias, authority);
    }
}

const CATALOG_SOURCE: Source = {
    urn: "urn:catalog",
    endpoints: [
        {
            urn: "urn:catalog:read",
            method: "GET",
            access: { mode: "public" },
            targetUrl: "https://catalog.example.test/items",
            headers: [
                {
                    name: "authorization",
                    source: { from: "secret", ref: "${API_KEY}", prefix: "Bearer " },
                },
            ],
            output: [{ status: "200", body: { type: "object" } }],
        },
    ],
};
