import { describe, expect, test } from "bun:test";
import { publishProxy, unpublishProxy } from "src/control/core/dataProvider/publishProxy";
import type { TDataProvider } from "src/socle/interfaces/Data/data";
import type { ProxyPublisher, ProxyPublishInput } from "src/socle/interfaces/ProxyPublisher";

class FakePublisher implements ProxyPublisher {
    public upserts:  ProxyPublishInput[] = [];
    public deletes:  string[]            = [];
    async upsertProxy(input: ProxyPublishInput) { this.upserts.push(input); }
    async deleteProxy(id: string)               { this.deletes.push(id);   }
}

const baseProvider: TDataProvider = {
    id:          "stripe",
    source:      "url",
    sourceUrl:   "https://stripe.com/openapi.json",
    server:      "",
    spec:        "",
    specAuth:    { type: "none" },
    runtimeAuth: { type: "none" },
    createdAt:   new Date(0),
    lastSyncAt:  null,
};

function makeCms(opts: { publisher: ProxyPublisher | null; provider: TDataProvider | null }): any {
    return {
        proxyPublisher: opts.publisher,
        repository: {
            getDataProvider: async (_id: string) => opts.provider,
        },
        secrets: {
            get: async (_k: string) => null,
        },
    };
}

describe("publishProxy", () => {
    test("no-op when no publisher is configured", async () => {
        const cms = makeCms({ publisher: null, provider: baseProvider });
        await publishProxy(cms, "stripe");
        // nothing to assert beyond not throwing
    });

    test("no-op when provider does not exist", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({ publisher: pub, provider: null });
        await publishProxy(cms, "stripe");
        expect(pub.upserts).toHaveLength(0);
    });

    test("no-op when provider has empty server (not synced)", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({ publisher: pub, provider: { ...baseProvider, server: "" } });
        await publishProxy(cms, "stripe");
        expect(pub.upserts).toHaveLength(0);
    });

    test("happy path with auth=none — publishes server, no token", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({
            publisher: pub,
            provider: { ...baseProvider, server: "https://api.stripe.com/v1" },
        });
        await publishProxy(cms, "stripe");
        expect(pub.upserts).toEqual([{
            providerId: "stripe",
            server:     "https://api.stripe.com/v1",
            auth:       { type: "none" },
        }]);
    });

    test("resolves bearer ${KEY} via secrets before publishing", async () => {
        const pub = new FakePublisher();
        const cms: any = {
            proxyPublisher: pub,
            repository: {
                getDataProvider: async () => ({
                    ...baseProvider,
                    server:      "https://api.stripe.com/v1",
                    runtimeAuth: { type: "bearer", token: "${STRIPE_KEY}" },
                }),
            },
            secrets: {
                get: async (k: string) => k === "STRIPE_KEY" ? "sk_live_REAL" : null,
            },
        };
        await publishProxy(cms, "stripe");
        expect(pub.upserts[0]?.auth).toEqual({ type: "bearer", token: "sk_live_REAL" });
    });

    test("does NOT use specAuth for proxy publish — only runtimeAuth", async () => {
        const pub = new FakePublisher();
        const cms: any = {
            proxyPublisher: pub,
            repository: {
                getDataProvider: async () => ({
                    ...baseProvider,
                    server:      "https://api.stripe.com/v1",
                    specAuth:    { type: "bearer", token: "spec-only" },
                    runtimeAuth: { type: "none" },
                }),
            },
            secrets: { get: async () => null },
        };
        await publishProxy(cms, "stripe");
        expect(pub.upserts[0]?.auth).toEqual({ type: "none" });
    });

    test("missing secret skips publish (logs warning, does not throw)", async () => {
        const pub = new FakePublisher();
        const cms: any = {
            proxyPublisher: pub,
            repository: {
                getDataProvider: async () => ({
                    ...baseProvider,
                    server:      "https://api.stripe.com/v1",
                    runtimeAuth: { type: "bearer", token: "${MISSING_KEY}" },
                }),
            },
            secrets: {
                get: async () => null,
            },
        };
        await publishProxy(cms, "stripe");
        expect(pub.upserts).toHaveLength(0);
    });
});

describe("unpublishProxy", () => {
    test("no-op when no publisher", async () => {
        const cms = makeCms({ publisher: null, provider: null });
        await unpublishProxy(cms, "stripe");
    });

    test("calls deleteProxy with providerId", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({ publisher: pub, provider: null });
        await unpublishProxy(cms, "stripe");
        expect(pub.deletes).toEqual(["stripe"]);
    });
});
