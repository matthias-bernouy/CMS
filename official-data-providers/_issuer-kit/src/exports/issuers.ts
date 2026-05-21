import type { Runner } from "@bernouy/core";
import { defaultClock } from "@bernouy/data-provider-contract";
import type { KeyStore } from "src/interfaces/KeyStore";
import type { IssuerConfig } from "src/interfaces/IssuerConfig";
import { parseIssuerConfig } from "src/core/schemas/issuerConfig";
import { createMinter } from "src/core/mint";
import { mountIssuer } from "src/exports/mountIssuer";

export interface IssuerOptions {
    issuer:            string;
    keyStore:          KeyStore;
    now?:              () => number;
    tokenTtlSeconds?:  number;
}

interface IssuerHandle {
    config: IssuerConfig;
    mount(runner: Runner): void;
    rotate(): Promise<void>;
}
export interface TenantIssuer extends IssuerHandle {
    /** `sub` = opaque id from the broker (computed OUTSIDE the kit). */
    mint(p: { aud: string; sub?: string; ttlSeconds?: number }): Promise<string>;
}
export interface ControlPlaneIssuer extends IssuerHandle {
    /** The hub acts machine-to-machine — **never** a `sub` (base.md §1.1). */
    mint(p: { aud: string; ttlSeconds?: number }): Promise<string>;
}

function base(o: IssuerOptions) {
    const now = o.now ?? defaultClock;
    const config = parseIssuerConfig({
        issuer: o.issuer,
        tokenTtlSeconds: o.tokenTtlSeconds,
    });
    const minter = createMinter({ keyStore: o.keyStore, config, now });
    return {
        config, minter,
        mount: (r: Runner) => mountIssuer(r, { config, keyStore: o.keyStore }),
        rotate: () => o.keyStore.rotate(),
    };
}

/** Proxy-side issuer: `iss` = the CMS instance; `role: tenant` (derived
 *  provider-side). One primitive, only the claims differ from the hub. */
export function createTenantIssuer(o: IssuerOptions): TenantIssuer {
    const b = base(o);
    return {
        config: b.config, mount: b.mount, rotate: b.rotate,
        mint: (p) => b.minter.mint({
            iss: b.config.issuer, aud: p.aud,
            ...(p.sub !== undefined ? { sub: p.sub } : {}),
            ...(p.ttlSeconds !== undefined ? { ttlSeconds: p.ttlSeconds } : {}),
        }),
    };
}

/** Hub-side issuer: `iss` = the hub; `role: control-plane`. No `sub` ever. */
export function createControlPlaneIssuer(o: IssuerOptions): ControlPlaneIssuer {
    const b = base(o);
    return {
        config: b.config, mount: b.mount, rotate: b.rotate,
        mint: (p) => b.minter.mint({
            iss: b.config.issuer, aud: p.aud,
            ...(p.ttlSeconds !== undefined ? { ttlSeconds: p.ttlSeconds } : {}),
        }),
    };
}
