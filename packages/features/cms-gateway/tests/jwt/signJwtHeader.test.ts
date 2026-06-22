import { describe, expect, mock, test } from "bun:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { executeEndpoint } from "cms-gateway/core/executeEndpoint";
import type { Endpoint } from "cms-gateway/interfaces/Gateway";

const ep = (over: Partial<Endpoint> = {}): Endpoint => ({
    urn: "urn:x:e",
    method: "GET",
    targetUrl: "https://api.example.com/v1/items",
    ...over,
});

describe("jwt config headers", () => {
    test("signs an RS256 JWT header and forwards it upstream", async () => {
        const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
        const privatePem = await exportPKCS8(privateKey);
        const fetchImpl = mock(async () => new Response("ok"));

        const endpoint = ep({
            headers: [{
                name: "Authorization",
                source: {
                    from: "jwt",
                    signingKeyRef: "JWT_PRIVATE_KEY",
                    alg: "RS256",
                    kid: "key-1",
                    ttlSeconds: 300,
                    claims: { sub: "$userID", aud: "upstream-api" },
                    prefix: "Bearer ",
                },
            }],
        });

        const res = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveSecret: async (ref) => ref === "JWT_PRIVATE_KEY" ? privatePem : undefined,
            resolveContext: async () => ({ userID: "user-123" }),
        });

        expect(res.status).toBe(200);
        const headers = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        const value = headers.get("authorization") ?? "";
        expect(value.startsWith("Bearer ")).toBe(true);

        const token = value.slice("Bearer ".length);
        const verified = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
        expect(verified.payload.sub).toBe("user-123");
        expect(verified.payload.aud).toBe("upstream-api");
        expect(verified.protectedHeader.alg).toBe("RS256");
        expect(verified.protectedHeader.kid).toBe("key-1");
    });

    test("does not call upstream when userID is required but absent", async () => {
        const { privateKey } = await generateKeyPair("RS256", { extractable: true });
        const privatePem = await exportPKCS8(privateKey);
        const fetchImpl = mock(async () => new Response("ok"));
        const endpoint = ep({ headers: [{
            name: "Authorization",
            source: { from: "jwt", signingKeyRef: "JWT_PRIVATE_KEY", claims: { sub: "$userID" } },
        }] });

        const res = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveSecret: async () => privatePem,
            resolveContext: async () => ({}),
        });

        expect(res.status).toBe(401);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("does not call upstream when the signing secret is missing", async () => {
        const fetchImpl = mock(async () => new Response("ok"));
        const endpoint = ep({ headers: [{
            name: "Authorization",
            source: { from: "jwt", signingKeyRef: "MISSING" },
        }] });

        const res = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveSecret: async () => undefined,
        });

        expect(res.status).toBe(500);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("returns 500 for reserved algorithms that are not wired yet", async () => {
        const fetchImpl = mock(async () => new Response("ok"));
        const endpoint = ep({ headers: [{
            name: "Authorization",
            source: { from: "jwt", signingKeyRef: "JWT_KEY", alg: "ES256" },
        }] });

        const res = await executeEndpoint(endpoint, new Request("http://local/x"), {
            fetchImpl,
            resolveSecret: async () => "unused",
        });

        expect(res.status).toBe(500);
        expect(await res.text()).toBe("jwt algorithm not wired yet: ES256");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
