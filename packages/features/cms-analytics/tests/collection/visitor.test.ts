import { describe, expect, test } from "bun:test";
import { deriveVisitorHash, truncateIpAddress } from "cms-analytics/core/identity/visitor";

const input = {
    secret: "shared-secret",
    siteScope: "site-a",
    utcDay: "2026-06-02",
    ip: "192.0.2.42",
    device: "desktop" as const,
    browser: "chrome" as const,
};

describe("deriveVisitorHash", () => {
    test("is a deterministic HMAC and rotates by site and UTC day", async () => {
        const hash = await deriveVisitorHash(input);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(await deriveVisitorHash(input)).toBe(hash);
        expect(await deriveVisitorHash({ ...input, siteScope: "site-b" })).not.toBe(hash);
        expect(await deriveVisitorHash({ ...input, utcDay: "2026-06-03" })).not.toBe(hash);
    });

    test("uses only the truncated network and coarse browser classes", async () => {
        const hash = await deriveVisitorHash(input);
        expect(await deriveVisitorHash({ ...input, ip: "192.0.2.199" })).toBe(hash);
        expect(await deriveVisitorHash({ ...input, ip: "192.0.3.1" })).not.toBe(hash);
        expect(await deriveVisitorHash({ ...input, browser: "firefox" })).not.toBe(hash);
    });

    test("fails closed without a shared secret or site scope", async () => {
        await expect(deriveVisitorHash({ ...input, secret: "" })).rejects.toThrow("secret is required");
        await expect(deriveVisitorHash({ ...input, siteScope: "" })).rejects.toThrow("site scope is required");
    });
});

describe("truncateIpAddress", () => {
    test("keeps IPv4 /24 and IPv6 /48 only", () => {
        expect(truncateIpAddress("203.0.113.47")).toBe("203.0.113.0/24");
        expect(truncateIpAddress("2001:db8:1234:5678:90ab:cdef:1234:5678")).toBe("2001:db8:1234::/48");
        expect(truncateIpAddress("2001:db8::1")).toBe("2001:db8:0::/48");
    });

    test("maps invalid or unavailable values to one fixed category", () => {
        expect(truncateIpAddress("")).toBe("unavailable");
        expect(truncateIpAddress("999.1.1.1")).toBe("unavailable");
        expect(truncateIpAddress("not-an-ip")).toBe("unavailable");
    });
});
