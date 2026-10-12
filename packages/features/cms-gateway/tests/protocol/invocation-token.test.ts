import { expect, test } from "bun:test";
import {
    providerInvocationKeyId,
    readProviderInvocationKeyId,
    signProviderInvocationToken,
    verifyProviderInvocationToken,
} from "@bernouy/cms-gateway/protocol";

const SECRET = "provider-shared-secret-with-enough-entropy";
const NOW = 1_800_000_000;
const claims = {
    version: 1 as const,
    requestId: "00000000-0000-4000-8000-000000000001",
    instanceId: "instance:shop-a",
    contractId: "ulvia.cms.pages",
    contractVersion: "1.0.0",
    capabilityId: "page.update",
    subjectId: "opaque-subject",
    issuedAt: NOW,
    expiresAt: NOW + 30,
};

test("provider invocation tokens preserve only the signed capability grant", () => {
    const token = signProviderInvocationToken(SECRET, claims);
    expect(verifyProviderInvocationToken(token, SECRET, NOW)).toEqual(claims);
    expect(readProviderInvocationKeyId(token)).toBe(providerInvocationKeyId(SECRET));
    expect(token).not.toContain(SECRET);
    expect(token).not.toContain("siteId");
    expect(token).not.toContain("installationId");
});

test("provider invocation tokens reject tampering, expiry and unexpected claims", () => {
    const token = signProviderInvocationToken(SECRET, claims);
    const parts = token.split(".");
    parts[2] = `${parts[2]!.startsWith("a") ? "b" : "a"}${parts[2]!.slice(1)}`;
    expect(() => verifyProviderInvocationToken(parts.join("."), SECRET, NOW)).toThrow("signature");
    expect(() => verifyProviderInvocationToken(token, SECRET, NOW + 36)).toThrow("expired");
    expect(() => signProviderInvocationToken(SECRET, { ...claims, siteId: "site-a" } as never)).toThrow("fields");
    expect(() => signProviderInvocationToken(SECRET, { ...claims, instanceId: "bad instance" })).toThrow("claims");
    expect(() => signProviderInvocationToken(SECRET, { ...claims, contractVersion: "latest" })).toThrow("claims");
});
