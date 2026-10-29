import { expect, test } from "bun:test";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { nativeFixture } from "./fixture";

test("verified native capability leases use no selection or installation reads at receipt", async () => {
    const f = await nativeFixture();
    expect(await f.authorize(f.claims)).toBe(true);
    const compiled = f.model.artifactReads;
    expect(await f.authorize(f.claims)).toBe(true);
    expect(f.model.reads).toEqual([]);
    expect(f.model.artifactReads).toBe(compiled);
});

test("an already issued lease survives grant, selection and installation changes only until token expiry", async () => {
    const f = await nativeFixture();
    const secret = "native-lease-test-" + "x".repeat(32);
    const token = signProviderInvocationToken(secret, f.claims);
    expect(await f.authorize(verifyProviderInvocationToken(token, secret, f.claims.issuedAt))).toBe(true);
    f.model.state = { selections: null, installations: [] };
    expect(await f.authorize(verifyProviderInvocationToken(token, secret, f.claims.issuedAt))).toBe(true);
    expect(f.model.reads).toEqual([]);
    expect(() => verifyProviderInvocationToken(token, secret, f.claims.expiresAt + 6)).toThrow("expired");
    f.model.now = f.claims.expiresAt + 6;
    expect(await f.authorize(f.claims)).toBe(false);
});

test("a lease cannot change its signed audience, connection or capability", async () => {
    const f = await nativeFixture();
    const secret = "native-lease-test-" + "x".repeat(32);
    const token = signProviderInvocationToken(secret, f.claims);
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ ...f.claims, connectionId: "another-installation" })).toString("base64url");
    expect(() => verifyProviderInvocationToken(parts.join("."), secret)).toThrow("signature");
    for (const claims of [
        { ...f.claims, connectionId: undefined },
        { ...f.claims, instanceId: "another-instance" },
        { ...f.claims, contractVersion: "2.0.0" },
        { ...f.claims, capabilityId: "not.declared" },
    ]) {
        expect(await f.authorize(claims)).toBe(false);
    }
});

test("inherited calls must belong to the runtime's exact admitted native ancestry", async () => {
    const f = await nativeFixture({ specialized: true });
    expect(await f.authorize(f.claims)).toBe(true);
    expect(await f.authorize({ ...f.claims, contractVersion: "2.0.0" })).toBe(false);
    expect(f.model.reads).toEqual([]);
});

test("the private control channel keeps fresh site, provider, account, status and grant checks", async () => {
    for (const change of [
        "destination",
        "site",
        "provider",
        "account",
        "instance",
        "status",
        "grant",
        "digest",
        "deleted",
    ] as const) {
        const f = await nativeFixture({ control: true });
        const claims = { ...f.claims, connectionId: undefined };
        expect(await f.authorize(claims, true)).toBe(true);
        const state = structuredClone(f.model.state);
        const selected = state.selections!.plan.selections[0]!;
        const stored = state.installations[0]!;
        if (change === "destination") {
            selected.installationId = "another-installation";
        }
        if (change === "site") {
            stored.installation.siteId = "another-site";
        }
        if (change === "provider") {
            stored.installation.providerId = "another-provider";
        }
        if (change === "account") {
            stored.installation.accountId = "another-account";
        }
        if (change === "instance") {
            stored.observation!.report.instanceId = "another-instance";
        }
        if (change === "status") {
            stored.installation.status = "disabled";
        }
        if (change === "grant") {
            state.selections!.grants.denied.push({ contractId: "ulvia.cms.installations", capabilityId: "item.list" });
        }
        if (change === "digest") {
            selected.digest = `sha256:${"0".repeat(64)}`;
        }
        if (change === "deleted") {
            state.selections = null;
        }
        f.model.state = state;
        expect(await f.authorize(claims, true)).toBe(false);
    }
});

test("control authority uses an approved compatible manifest without runtime manifest conformance", async () => {
    const f = await nativeFixture({ control: true });
    const state = structuredClone(f.model.state);
    const stored = state.installations[0]!;
    const manifest = { version: "1.1.0", digest: `sha256:${"b".repeat(64)}` as const };
    stored.installation.approval.manifestVersion = manifest.version;
    stored.installation.approval.manifestDigest = manifest.digest;
    stored.observation!.report.manifest = manifest;
    f.model.state = state;
    expect(await f.authorize({ ...f.claims, connectionId: undefined }, true)).toBe(true);
});
