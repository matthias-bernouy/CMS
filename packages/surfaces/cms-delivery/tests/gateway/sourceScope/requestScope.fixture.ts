import { InMemoryIdentityService, type IdentityAlias, type IdentityValue } from "@bernouy/cms-identities";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, type Source } from "@bernouy/cms-sources";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import {
    createDeliverySourceRequestScope,
    deliverySourceOverlaySchemaCache,
} from "cms-delivery/core/sources/requestScope";

export type ScopeCounters = {
    sourceReads: number;
    endpointReads: number;
    overlayReads: number;
    identityReads: number;
    secretReads: number;
};

export async function requestScopeHarness() {
    const counters: ScopeCounters = {
        sourceReads: 0,
        endpointReads: 0,
        overlayReads: 0,
        identityReads: 0,
        secretReads: 0,
    };
    const sources = new CountingSources(counters);
    const overlays = new CountingOverlays(counters);
    const identities = new CountingIdentities(counters);
    await sources.createSource(CATALOG_SOURCE);
    await overlays.upsertOverlay({
        id: "catalog-fields",
        sourceId: "catalog",
        output: [{ endpointId: "read" }],
        fields: [{ id: "reference", label: "Reference", type: "string" }],
    });
    const delivery = {
        sources,
        sourceOverlays: overlays,
        identities,
        sourceResolveSecret: async () => {
            counters.secretReads += 1;
            return "request-secret";
        },
    } as unknown as DeliveryCms;
    const schemaCache = deliverySourceOverlaySchemaCache(delivery);

    return {
        counters,
        delivery,
        endpoint: CATALOG_SOURCE.endpoints[0]!,
        scope: (request: Request) => createDeliverySourceRequestScope(delivery, request, schemaCache),
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

class CountingOverlays extends InMemorySourceOverlayRepository {
    constructor(private readonly counters: ScopeCounters) {
        super();
    }
    override async getOverlaysForSource(sourceId: string) {
        this.counters.overlayReads += 1;
        return super.getOverlaysForSource(sourceId);
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
