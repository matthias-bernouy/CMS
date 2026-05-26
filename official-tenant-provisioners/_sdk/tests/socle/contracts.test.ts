import { test, expect } from "bun:test";
import { join } from "node:path";
import { sdkPackageRoot } from "src/constants";
import { TokenClaimsSchema, type TokenClaimsParsed } from "src/core/schemas/claims";
import { parseProviderConfig } from "src/core/schemas/providerConfig";
import { ConfigError } from "src/core/errors";
import type { TokenClaims } from "src/types/claims";
import type { ProviderHooks } from "src/interfaces/hooks";
import { metadocPath, TENANT_PROVISIONER_CONTRACT_VERSION } from "@bernouy/tenant-provisioner-contract";

test("shared contract: metadocPath append convention (locks sign↔verify)", () => {
    expect(metadocPath("https://h/instance-1-cms"))
        .toBe("https://h/instance-1-cms/.well-known/oauth-authorization-server");
    expect(metadocPath("https://h/a/")) // trailing slash tolerated, no double //
        .toBe("https://h/a/.well-known/oauth-authorization-server");
    expect(TENANT_PROVISIONER_CONTRACT_VERSION).toBe("1.0");
});

// --- Type-level equivalence: pure TokenClaims <-> zod-inferred ---------------
const _claimsAB: TokenClaims = {} as TokenClaimsParsed;
const _claimsBA: TokenClaimsParsed = {} as TokenClaims;
void _claimsAB; void _claimsBA;

const goodClaims = {
    iss: "https://cms.tenant-a.example", aud: "prov-1",
    iat: 1, exp: 2, jti: "j1",
};

test("claims schema: nominal accepted, sub optional, extra tolerated", () => {
    expect(TokenClaimsSchema.safeParse(goodClaims).success).toBe(true);
    expect(TokenClaimsSchema.safeParse({ ...goodClaims, sub: "opaque" }).success).toBe(true);
    expect(TokenClaimsSchema.safeParse({ ...goodClaims, nbf: 0 }).success).toBe(true);
});

test("claims schema: missing iss / bad type rejected", () => {
    const { iss: _omit, ...noIss } = goodClaims;
    expect(TokenClaimsSchema.safeParse(noIss).success).toBe(false);
    expect(TokenClaimsSchema.safeParse({ ...goodClaims, iat: "x" }).success).toBe(false);
    expect(TokenClaimsSchema.safeParse({ ...goodClaims, iss: "not-a-url" }).success).toBe(false);
});

test("ProviderConfig: defaults applied when omitted", () => {
    const cfg = parseProviderConfig({
        providerId: "prov-1",
        allowlist: [{ iss: "https://hub.example", role: "control-plane" }],
    });
    expect(cfg.crypto.algorithms).toEqual(["ES256"]);
    expect(cfg.crypto.tokenTtlSeconds).toBe(120);
    expect(cfg.crypto.clockSkewSeconds).toBe(30);
    expect(cfg.tenantStateCacheTtlSeconds).toBe(30);
    expect(cfg.supportedContractVersion).toBe("1.0");
    expect(cfg.defaultDeprovisionPolicy).toEqual({ mode: "grace", graceSeconds: 7 * 24 * 3600 });
});

test("ProviderConfig: invalid input throws ConfigError", () => {
    expect(() => parseProviderConfig({ providerId: "x", allowlist: [] }))
        .toThrow(ConfigError);
    expect(() => parseProviderConfig({ allowlist: [{ iss: "https://h", role: "tenant" }] }))
        .toThrow(ConfigError);
});

test("ProviderConfig: crypto.algorithms restricted to the contract set", () => {
    const base = { providerId: "p", allowlist: [{ iss: "https://h", role: "tenant" as const }] };
    // unsupported / empty alg lists are rejected (anti alg-confusion)
    expect(() => parseProviderConfig({ ...base, crypto: { algorithms: ["RS256"] } }))
        .toThrow(ConfigError);
    expect(() => parseProviderConfig({ ...base, crypto: { algorithms: [] } }))
        .toThrow(ConfigError);
    // the supported set still parses
    expect(parseProviderConfig({ ...base, crypto: { algorithms: ["ES256"] } }).crypto.algorithms)
        .toEqual(["ES256"]);
});

test("ProviderHooks fixture compiles (type-level)", () => {
    const hooks: ProviderHooks = {
        onProvision: async () => {},
        onUpdate:    async () => {},
        onDeprovision: async () => {},
    };
    expect(typeof hooks.onProvision).toBe("function");
});

test("interfaces/ contain no executable/runtime import (Socle purity)", async () => {
    const dir = join(sdkPackageRoot, "src", "interfaces");
    const offenders: string[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: dir })) {
        const text = await Bun.file(join(dir, file)).text();
        for (const line of text.split("\n")) {
            const t = line.trim();
            if (/^import\s+(?!type\b)/.test(t)) offenders.push(`${file}: ${t}`);
            if (t.includes('from "zod"')) offenders.push(`${file}: zod`);
        }
    }
    expect(offenders).toEqual([]);
});
