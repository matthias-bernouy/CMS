import { describe, expect, test } from "bun:test";
import { publishProxy, unpublishProxy } from "src/control/core/dataProvider/publishProxy";
import type { TDataProvider } from "src/socle/interfaces/Data/data";
import type { ProxyPublisher, ProxyPublishInput } from "src/socle/interfaces/ProxyPublisher";

class FakePublisher implements ProxyPublisher {
    public upserts: ProxyPublishInput[] = [];
    public deletes: string[]            = [];
    async upsertProxy(input: ProxyPublishInput) { this.upserts.push(input); }
    async deleteProxy(id: string)               { this.deletes.push(id);   }
}

const baseProvider: TDataProvider = {
    id:         "stripe",
    source:     "url",
    sourceUrl:  "https://stripe.com/openapi.json",
    server:     "",
    spec:       "",
    specAuth:   { type: "none" },
    rules:      { paths: {} },
    secrets:    {},
    createdAt:  new Date(0),
    lastSyncAt: null,
};

function makeCms(opts: { publisher: ProxyPublisher | null; provider: TDataProvider | null }): any {
    return {
        proxyPublisher: opts.publisher,
        repository:     { getDataProvider: async (_id: string) => opts.provider },
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

    test("happy path with empty rules + empty secrets — passthrough", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({
            publisher: pub,
            provider: { ...baseProvider, server: "https://api.stripe.com/v1" },
        });
        await publishProxy(cms, "stripe");
        expect(pub.upserts).toEqual([{
            providerId: "stripe",
            server:     "https://api.stripe.com/v1",
            rules:      { paths: {} },
            secrets:    {},
        }]);
    });

    test("rules + secrets are forwarded verbatim — no translation, no resolve", async () => {
        const pub = new FakePublisher();
        const provider: TDataProvider = {
            ...baseProvider,
            server:  "https://api.stripe.com/v1",
            rules:   {
                defaults: { on_request: [
                    { type: "inject_header", name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
                ] },
                paths: { "/v1/charges": { on_request: [] } },
            },
            secrets: { STRIPE_KEY: "sk_live_REAL" },
        };
        const cms = makeCms({ publisher: pub, provider });
        await publishProxy(cms, "stripe");
        expect(pub.upserts[0]?.rules).toEqual(provider.rules);
        expect(pub.upserts[0]?.secrets).toEqual({ STRIPE_KEY: "sk_live_REAL" });
    });

    test("specAuth is NEVER shipped to the publisher — admin-time only", async () => {
        const pub = new FakePublisher();
        const cms = makeCms({
            publisher: pub,
            provider: {
                ...baseProvider,
                server:   "https://api.stripe.com/v1",
                specAuth: { type: "bearer", token: "fetch-only" },
            },
        });
        await publishProxy(cms, "stripe");
        const input = pub.upserts[0]!;
        expect(JSON.stringify(input)).not.toContain("fetch-only");
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
