import { test, expect } from "bun:test";
import {
    DATA_PROVIDER_CONTRACT_VERSION, METADOC_VERSION_FIELD, metadocPath,
} from "@bernouy/data-provider-contract";
import { parseIssuerConfig } from "src/core/schemas/issuerConfig";
import { buildMetadoc } from "src/core/publish/metadoc";
import { buildJwks } from "src/core/publish/jwks";
import { MemoryKeyStore } from "src/default-implementation/MemoryKeyStore";

const ISS = "https://cdn.example/instance-1-cms";

test("buildMetadoc satisfies every _sdk discovery invariant by construction", () => {
    const cfg = parseIssuerConfig({ issuer: ISS });
    const m = buildMetadoc(cfg);

    // _sdk discovery.ts checks: issuer === iss (exact), jwks_uri same-origin,
    // version under METADOC_VERSION_FIELD, served at metadocPath(iss).
    expect(m["issuer"]).toBe(ISS);
    expect(new URL(String(m["jwks_uri"])).origin).toBe(new URL(ISS).origin);
    expect(m[METADOC_VERSION_FIELD]).toBe(DATA_PROVIDER_CONTRACT_VERSION);
    expect(m["signing_alg_values_supported"]).toEqual(["ES256"]);
    // the literal field name is the contract one (locks sign↔verify)
    expect(METADOC_VERSION_FIELD).toBe("data_provider_contract_version");
    expect(metadocPath(ISS))
        .toBe(`${ISS}/.well-known/oauth-authorization-server`);
});

test("buildJwks publishes active + overlapping keys (jose-importable)", async () => {
    let t = 1000;
    const ks = new MemoryKeyStore({ now: () => t, keyOverlapSeconds: 100 });
    await ks.loadActive();
    await ks.rotate();
    const jwks = await buildJwks(ks);
    const all = await ks.loadAll();
    expect(jwks.keys.map((k) => k.kid).sort())
        .toEqual(all.map((k) => k.publicJwk.kid).sort());
    expect(jwks.keys.length).toBe(2);                       // active + retired in overlap
    for (const k of jwks.keys) {
        expect(k.alg).toBe("ES256");
        expect(k.use).toBe("sig");
        expect(typeof k.kid).toBe("string");
    }
});
