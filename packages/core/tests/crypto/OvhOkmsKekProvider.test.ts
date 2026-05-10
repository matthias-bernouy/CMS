import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { OvhOkmsKekProvider, OvhOkmsError } from "src/crypto/OvhOkmsKekProvider";

// Stub mTLS files so the constructor doesn't error on `readFileSync`.
const fixtures = mkdtempSync(join(tmpdir(), "okms-test-"));
const certPath = join(fixtures, "client.crt");
const keyPath  = join(fixtures, "client.key");
writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----");
writeFileSync(keyPath,  "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----");

const baseConfig = {
    region:   "eu-west-rbx",
    domainId: "domain-uuid",
    keyId:    "key-uuid",
    certPath,
    keyPath,
    backoffMs:  1, // keep tests fast
    maxRetries: 3,
};

function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>): typeof fetch {
    return ((url: string, init: RequestInit) => handler(url, init ?? {})) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("OvhOkmsKekProvider", () => {
    test("generateDek calls the datakey endpoint and parses { key, plaintext }", async () => {
        let captured: { url: string; init: RequestInit } | null = null;
        const dek = randomBytes(32);
        const fetch = mockFetch(async (url, init) => {
            captured = { url, init };
            return jsonResponse(201, { key: "JWE.fake.token", plaintext: dek.toString("base64") });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });

        const result = await provider.generateDek();
        expect(captured!.url).toBe("https://eu-west-rbx.okms.ovh.net/api/domain-uuid/v1/servicekey/key-uuid/datakey");
        expect(captured!.init.method).toBe("POST");
        const body = JSON.parse(captured!.init.body as string);
        expect(body.size).toBe(256);
        expect(body.name).toMatch(/^dek-/);
        expect(result.wrapped).toBe("JWE.fake.token");
        expect(result.plaintext.equals(dek)).toBe(true);
    });

    test("unwrap calls the decrypt endpoint and parses { plaintext }", async () => {
        let captured: { url: string; body: string } | null = null;
        const dek = randomBytes(32);
        const fetch = mockFetch(async (url, init) => {
            captured = { url, body: init.body as string };
            return jsonResponse(200, { plaintext: dek.toString("base64") });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });

        const out = await provider.unwrap("JWE.fake.token");
        expect(captured!.url).toBe("https://eu-west-rbx.okms.ovh.net/api/domain-uuid/v1/servicekey/key-uuid/datakey/decrypt");
        expect(JSON.parse(captured!.body)).toEqual({ key: "JWE.fake.token" });
        expect(out.equals(dek)).toBe(true);
    });

    test("4xx response throws OvhOkmsError immediately (no retry)", async () => {
        let calls = 0;
        const fetch = mockFetch(async () => {
            calls++;
            return jsonResponse(403, { error: "forbidden", message: "policy missing" });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });
        await expect(provider.generateDek()).rejects.toBeInstanceOf(OvhOkmsError);
        expect(calls).toBe(1);
    });

    test("5xx response retries up to maxRetries then throws", async () => {
        let calls = 0;
        const fetch = mockFetch(async () => {
            calls++;
            return jsonResponse(503, { error: "unavailable" });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch, maxRetries: 3 });
        await expect(provider.generateDek()).rejects.toBeInstanceOf(OvhOkmsError);
        expect(calls).toBe(3);
    });

    test("transient 5xx then 200 — second attempt wins", async () => {
        let calls = 0;
        const dek = randomBytes(32);
        const fetch = mockFetch(async () => {
            calls++;
            if (calls === 1) return jsonResponse(503, {});
            return jsonResponse(201, { key: "ok", plaintext: dek.toString("base64") });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });
        const result = await provider.generateDek();
        expect(calls).toBe(2);
        expect(result.wrapped).toBe("ok");
    });

    test("network error retries (transient class)", async () => {
        let calls = 0;
        const dek = randomBytes(32);
        const fetch = mockFetch(async () => {
            calls++;
            if (calls < 2) throw new Error("ECONNRESET");
            return jsonResponse(201, { key: "ok", plaintext: dek.toString("base64") });
        });
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });
        const result = await provider.generateDek();
        expect(calls).toBe(2);
        expect(result.wrapped).toBe("ok");
    });

    test("plaintext of unexpected size throws", async () => {
        const fetch = mockFetch(async () =>
            jsonResponse(201, { key: "ok", plaintext: Buffer.alloc(16).toString("base64") })
        );
        const provider = new OvhOkmsKekProvider({ ...baseConfig, fetch });
        await expect(provider.generateDek()).rejects.toThrow(/16-byte DEK/);
    });
});
