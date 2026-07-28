import { describe, expect, test } from "bun:test";
import {
    ClientAddressUnavailableError,
    InvalidForwardedChainError,
    normalizeIpAddress,
    resolveClientAddress,
    setRequestIP,
} from "@bernouy/http-runner";

describe("HTTP client address resolution", () => {
    test("canonicalizes IPv4 and IPv6 addresses", () => {
        expect(normalizeIpAddress("192.0.2.10")).toBe("192.0.2.10");
        expect(normalizeIpAddress("2001:0db8:0:0:0:0:0:1")).toBe("2001:db8::1");
        expect(normalizeIpAddress("192.0.2.10:443")).toBeUndefined();
        expect(normalizeIpAddress("fe80::1%eth0")).toBeUndefined();
    });

    test("direct mode ignores forwarding headers", () => {
        const request = stampedRequest("198.51.100.4", "203.0.113.8");
        expect(resolveClientAddress(request, { mode: "direct" })).toBe("198.51.100.4");
    });

    test("active modes fail closed when the runner did not record a peer", () => {
        expect(() => resolveClientAddress(new Request("https://example.test"), { mode: "direct" })).toThrow(
            ClientAddressUnavailableError,
        );
        try {
            resolveClientAddress(new Request("https://example.test"), { mode: "direct" });
        } catch (error) {
            expect(error).toMatchObject({ status: 503, publicCode: "client_address_unavailable" });
        }
    });

    test("selects the address immediately before one or two trusted hops", () => {
        const oneHop = stampedRequest("10.0.0.2", "198.51.100.8");
        expect(resolveClientAddress(oneHop, { mode: "trusted-proxy", trustedProxyHops: 1 })).toBe("198.51.100.8");

        const twoHops = stampedRequest("10.0.0.2", "198.51.100.8, 10.0.0.3");
        expect(resolveClientAddress(twoHops, { mode: "trusted-proxy", trustedProxyHops: 2 })).toBe("198.51.100.8");
    });

    test("validates the complete forwarded chain and its trusted suffix", () => {
        const malformed = stampedRequest("10.0.0.2", "not-an-ip, 198.51.100.8");
        expect(() => resolveClientAddress(malformed, { mode: "trusted-proxy", trustedProxyHops: 1 })).toThrow(
            InvalidForwardedChainError,
        );
        try {
            resolveClientAddress(stampedRequest("10.0.0.2"), { mode: "trusted-proxy", trustedProxyHops: 1 });
        } catch (error) {
            expect(error).toMatchObject({ status: 400, publicCode: "invalid_forwarded_chain" });
        }
    });

    test("resolves loopback peers before inspecting forwarding headers", () => {
        for (const peer of ["127.0.0.7", "::1", "::ffff:127.0.0.1"]) {
            const request = stampedRequest(peer, "malformed");
            expect(resolveClientAddress(request, { mode: "trusted-proxy", trustedProxyHops: 1 })).toBe("loopback");
        }
    });

    test("disabled mode returns no key and trusted mode requires a positive hop count", () => {
        expect(resolveClientAddress(stampedRequest("198.51.100.4"), { mode: "disabled" })).toBeUndefined();
        expect(() =>
            resolveClientAddress(stampedRequest("198.51.100.4", "203.0.113.1"), {
                mode: "trusted-proxy",
                trustedProxyHops: 0,
            }),
        ).toThrow(/positive safe integer/);
    });
});

function stampedRequest(peer: string, forwarded?: string): Request {
    const request = new Request("https://example.test/package", {
        headers: forwarded ? { "x-forwarded-for": forwarded } : undefined,
    });
    setRequestIP(request, peer);
    return request;
}
