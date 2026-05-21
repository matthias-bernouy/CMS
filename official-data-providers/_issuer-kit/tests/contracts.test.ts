import { test, expect } from "bun:test";
import { join } from "node:path";
import { issuerKitPackageRoot } from "src/constants";
import { parseIssuerConfig } from "src/core/schemas/issuerConfig";
import { IssuerError } from "src/core/errors";
import { CRYPTO_DEFAULTS } from "@bernouy/data-provider-contract";

test("IssuerConfig: defaults from the SHARED contract profile (no local copy)", () => {
    const c = parseIssuerConfig({ issuer: "https://cdn.example/instance-1" });
    expect(c.algorithms).toEqual([...CRYPTO_DEFAULTS.algorithms]);
    expect(c.tokenTtlSeconds).toBe(CRYPTO_DEFAULTS.tokenTtlSeconds);
    // overlap ≥ maxTTL + skew (publish-before-sign window, base.md §4.8).
    // Skew lives on the verifier (jose `clockTolerance` in the SDK), not on
    // the signer — so it's no longer part of IssuerConfig.
    expect(c.keyOverlapSeconds).toBeGreaterThanOrEqual(
        CRYPTO_DEFAULTS.tokenTtlMax + CRYPTO_DEFAULTS.clockSkewMax,
    );
    // jwksUri defaults same-origin
    expect(c.jwksUri).toBe("https://cdn.example/instance-1/jwks.json");
});

test("IssuerConfig: rejects non-URL issuer and cross-origin jwksUri", () => {
    expect(() => parseIssuerConfig({ issuer: "not-a-url" })).toThrow(IssuerError);
    expect(() => parseIssuerConfig({
        issuer: "https://cdn.example/i1", jwksUri: "https://evil.example/jwks.json",
    })).toThrow(IssuerError);
    // same-origin different path is fine
    expect(parseIssuerConfig({
        issuer: "https://cdn.example/i1", jwksUri: "https://cdn.example/i1/keys",
    }).jwksUri).toBe("https://cdn.example/i1/keys");
});

test("IssuerConfig: ttl out of contract bounds rejected", () => {
    expect(() => parseIssuerConfig({ issuer: "https://h/x", tokenTtlSeconds: 5 })).toThrow(IssuerError);
    expect(() => parseIssuerConfig({ issuer: "https://h/x", tokenTtlSeconds: 99999 })).toThrow(IssuerError);
});

test("IssuerConfig: rejects an unsupported algorithm (no metadoc↔signature drift)", () => {
    // the minter only signs ES256 — advertising RS256 in the metadoc would lie.
    expect(() => parseIssuerConfig({ issuer: "https://h/x", algorithms: ["RS256"] })).toThrow(IssuerError);
    expect(() => parseIssuerConfig({ issuer: "https://h/x", algorithms: [] })).toThrow(IssuerError);
    // the supported set still parses.
    expect(parseIssuerConfig({ issuer: "https://h/x", algorithms: [...CRYPTO_DEFAULTS.algorithms] }).algorithms)
        .toEqual([...CRYPTO_DEFAULTS.algorithms]);
});

test("interfaces/ contain no executable/runtime import (Socle purity)", async () => {
    const dir = join(issuerKitPackageRoot, "src", "interfaces");
    const offenders: string[] = [];
    for await (const f of new Bun.Glob("**/*.ts").scan({ cwd: dir })) {
        const text = await Bun.file(join(dir, f)).text();
        for (const line of text.split("\n")) {
            const t = line.trim();
            if (/^import\s+(?!type\b)/.test(t)) offenders.push(`${f}: ${t}`);
            if (t.includes('from "zod"')) offenders.push(`${f}: zod`);
        }
    }
    expect(offenders).toEqual([]);
});
