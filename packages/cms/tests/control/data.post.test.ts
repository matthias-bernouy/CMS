import { describe, test, expect } from "bun:test";
import postDataProvider from "src/control/api/data/provider/provider.post";
import type { TDataProvider } from "src/socle/interfaces/Data/data";

function makeSystem(opts: { existingById?: Record<string, TDataProvider> } = {}) {
    const createCalls: Array<Omit<TDataProvider, "createdAt" | "lastSyncAt">> = [];
    const cms: any = {
        repository: {
            getDataProvider:    async (id: string) => opts.existingById?.[id] ?? null,
            createDataProvider: async (p: Omit<TDataProvider, "createdAt" | "lastSyncAt">) => {
                createCalls.push(p);
                return { ...p, createdAt: new Date(), lastSyncAt: null } as TDataProvider;
            },
        },
    };
    return { cms, createCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/data/provider", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

const existingHub: TDataProvider = {
    id:         "hub",
    source:     "url",
    sourceUrl:  "https://hub.bernouy.fr/openapi.json",
    server:     "",
    spec:       "",
    specAuth:   { type: "none" },
    rules:      { paths: {} },
    secrets:    {},
    createdAt:  new Date(),
    lastSyncAt: null,
};

const validBody = {
    id:        "hub",
    source:    "url",
    sourceUrl: "https://hub.bernouy.fr/openapi.json",
};

describe("POST /api/data/provider (create)", () => {
    test("throws when id is missing", async () => {
        const { cms } = makeSystem();
        await expect(postDataProvider(makeRequest({ ...validBody, id: "" }), cms))
            .rejects.toThrow(/Missing param id/);
    });

    test("throws when sourceUrl is missing", async () => {
        const { cms } = makeSystem();
        await expect(postDataProvider(makeRequest({ ...validBody, sourceUrl: "" }), cms))
            .rejects.toThrow(/Missing param sourceUrl/);
    });

    test.each([
        ["Hub"],          // uppercase
        ["hub_api"],      // underscore
        ["hub api"],      // space
        ["-leading"],     // leading dash
        ["trailing-"],    // trailing dash
        ["double--dash"], // consecutive dashes
        ["a"],            // too short
        ["a".repeat(33)], // too long
    ])("throws on invalid id %p", async (id) => {
        const { cms } = makeSystem();
        await expect(postDataProvider(makeRequest({ ...validBody, id }), cms))
            .rejects.toThrow();
    });

    test.each([["hub"], ["hub-api"], ["a1-b2-c3"], ["xy"]])(
        "succeeds on valid id %p",
        async (id) => {
            const { cms, createCalls } = makeSystem();
            const res = await postDataProvider(makeRequest({ ...validBody, id }), cms);
            expect(res.ok).toBe(true);
            expect(createCalls[0]?.id).toBe(id);
        }
    );

    test.each([
        ["not-a-url"],
        ["ftp://example.com/openapi.json"],
        ["javascript:alert(1)"],
    ])("throws on invalid sourceUrl %p", async (sourceUrl) => {
        const { cms } = makeSystem();
        await expect(postDataProvider(makeRequest({ ...validBody, sourceUrl }), cms))
            .rejects.toThrow(/sourceUrl/);
    });

    test("throws on unsupported source", async () => {
        const { cms } = makeSystem();
        await expect(postDataProvider(makeRequest({ ...validBody, source: "paste" }), cms))
            .rejects.toThrow(/source/);
    });

    test("throws when id already exists", async () => {
        const { cms, createCalls } = makeSystem({ existingById: { hub: existingHub } });
        await expect(postDataProvider(makeRequest(validBody), cms))
            .rejects.toThrow(/already used/);
        expect(createCalls).toHaveLength(0);
    });

    test("happy path: persists with default empty spec and none auth", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(makeRequest(validBody), cms);
        expect(createCalls).toHaveLength(1);
        const p = createCalls[0]!;
        expect(p.id).toBe("hub");
        expect(p.source).toBe("url");
        expect(p.sourceUrl).toBe("https://hub.bernouy.fr/openapi.json");
        expect(p.spec).toBe("");
        expect(p.specAuth).toEqual({ type: "none" });
    });

    test("auth defaults to none when no bearer or headers provided", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(makeRequest(validBody), cms);
        expect(createCalls[0]?.specAuth).toEqual({ type: "none" });
    });

    test("bearer token is captured as bearer auth", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(
            makeRequest({ ...validBody, "specAuth.bearer": "  eyJhbG.xyz  " }),
            cms,
        );
        expect(createCalls[0]?.specAuth).toEqual({ type: "bearer", token: "eyJhbG.xyz" });
    });

    test("headers are collected and sorted by index", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(
            makeRequest({
                ...validBody,
                "specAuth.headers.1.name":  "X-Tenant",
                "specAuth.headers.1.value": "acme",
                "specAuth.headers.0.name":  "X-API-Key",
                "specAuth.headers.0.value": "secret",
            }),
            cms,
        );
        expect(createCalls[0]?.specAuth).toEqual({
            type: "headers",
            headers: [
                { name: "X-API-Key", value: "secret" },
                { name: "X-Tenant",  value: "acme" },
            ],
        });
    });

    test("bearer wins over headers when both are filled", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(
            makeRequest({
                ...validBody,
                "specAuth.bearer":          "tok",
                "specAuth.headers.0.name":  "X-API-Key",
                "specAuth.headers.0.value": "secret",
            }),
            cms,
        );
        expect(createCalls[0]?.specAuth).toEqual({ type: "bearer", token: "tok" });
    });

    test("empty header rows are skipped silently", async () => {
        const { cms, createCalls } = makeSystem();
        await postDataProvider(
            makeRequest({
                ...validBody,
                "specAuth.headers.0.name":  "",
                "specAuth.headers.0.value": "",
                "specAuth.headers.1.name":  "X-Real",
                "specAuth.headers.1.value": "yes",
            }),
            cms,
        );
        expect(createCalls[0]?.specAuth).toEqual({
            type: "headers",
            headers: [{ name: "X-Real", value: "yes" }],
        });
    });

    test("rejects header with name but no value", async () => {
        const { cms } = makeSystem();
        await expect(postDataProvider(
            makeRequest({ ...validBody, "specAuth.headers.0.name": "X-API-Key", "specAuth.headers.0.value": "" }),
            cms,
        )).rejects.toThrow(/specAuth\.headers\.0\.value/);
    });

    test.each([
        ["X-API Key"],   // space
        ["X:API"],       // colon
        ["X\nAPI"],      // newline
        ["a".repeat(65)], // too long
    ])("rejects invalid header name %p", async (name) => {
        const { cms } = makeSystem();
        await expect(postDataProvider(
            makeRequest({ ...validBody, "specAuth.headers.0.name": name, "specAuth.headers.0.value": "v" }),
            cms,
        )).rejects.toThrow(/specAuth\.headers\.0\.name/);
    });

    test("rejects header value with newline", async () => {
        const { cms } = makeSystem();
        await expect(postDataProvider(
            makeRequest({ ...validBody, "specAuth.headers.0.name": "X-API-Key", "specAuth.headers.0.value": "a\nb" }),
            cms,
        )).rejects.toThrow(/specAuth\.headers\.0\.value/);
    });
});
