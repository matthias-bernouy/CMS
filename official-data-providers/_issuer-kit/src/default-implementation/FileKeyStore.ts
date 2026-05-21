import { rename } from "node:fs/promises";
import { exportJWK, importJWK } from "jose";
import {
    encryptAesGcm, decryptAesGcm, serializeBlob, parseBlob, type KekProvider,
} from "@bernouy/core";
import type { KeyStore } from "src/interfaces/KeyStore";
import type { SigningKey, PublishedKey } from "src/types/SigningKey";
import { generateSigningKey } from "src/core/keys/generate";
import { isPrunable } from "src/core/keys/rotation";
import { KeyStoreError } from "src/core/errors";

interface DiskKey {
    kid: string; publicJwk: PublishedKey["publicJwk"];
    createdAt: number; retiredAt?: number;
    wrappedDek: string; encPriv: string;        // never the private key in clear
}

/**
 * Persistent default `KeyStore` — keys on disk, **private key encrypted at
 * rest** (envelope: a per-key DEK from the injected `KekProvider`
 * encrypts the private JWK; the DEK is wrapped by the KEK). Same primitive
 * the repo already uses for tenant/bucket secrets. Never writes a private
 * key in clear; fail-fast (`KeyStoreError`) if the KEK can't unwrap or the
 * file is corrupt — signing with a broken/unprotected key is refused.
 *
 * Concurrency: all mutating ops are serialized by an in-process promise
 * chain (`_locked`) so a cold-start race can't sign with a `kid` that never
 * made it into the published JWKS. Durability: writes go to `path.tmp` then
 * an atomic `rename()`, so a crash mid-write can't corrupt/lose the key file.
 *
 * Trust assumptions (documented, NOT enforced here):
 *  - (single-instance) one file = one writer. Multiple instances/processes
 *    for the SAME `iss` need a shared store (DB/KMS) — the in-process lock
 *    does not span processes. Deferred.
 *  - (D) only the private key is authenticated (AES-GCM). The cleartext
 *    metadata (`kid`/`createdAt`/`retiredAt`/`publicJwk`) is NOT integrity-
 *    protected: an attacker with file-write access (but no KEK) cannot forge
 *    a usable signing key (decrypt fails → `KeyStoreError`), but could flip
 *    `retiredAt` to force-prune a valid key (DoS). File-write access is
 *    already a serious breach; whole-file authentication is a future option.
 *  - (F) `prune` trusts a quasi-monotonic clock. A large forward jump (NTP
 *    correction) can prune retired keys before tokens they signed expire;
 *    the overlap window (tokenTtlMax + clockSkewMax) absorbs normal skew.
 *  - (G) KEK rotation (re-wrapping each key's DEK) is not handled here.
 */
export class FileKeyStore implements KeyStore {
    constructor(private readonly o: {
        path: string; kek: KekProvider; now: () => number; keyOverlapSeconds: number;
    }) {}

    // ── (A) in-process serialization ──────────────────────────────────
    private _chain: Promise<unknown> = Promise.resolve();
    /** Run `fn` after any in-flight op (regardless of its outcome) so
     *  read-modify-write sequences never interleave within this instance. */
    private _locked<T>(fn: () => Promise<T>): Promise<T> {
        const run = this._chain.then(fn, fn);
        this._chain = run.then(() => undefined, () => undefined);
        return run;
    }

    private async read(): Promise<DiskKey[]> {
        const f = Bun.file(this.o.path);
        if (!(await f.exists())) return [];
        let parsed: unknown;
        try { parsed = JSON.parse(await f.text()); }
        catch (e) { throw new KeyStoreError(`corrupt key file: ${String(e)}`); }
        // (E) tolerate a malformed-but-parseable file (e.g. `{}`): treat as
        // "no keys" rather than throwing on `.keys` being absent/non-array.
        const keys = (parsed as { keys?: unknown })?.keys;
        return Array.isArray(keys) ? (keys as DiskKey[]) : [];
    }
    // ── (B) atomic write: tmp file + rename (atomic on the same fs) ──────
    private async write(keys: DiskKey[]): Promise<void> {
        const tmp = `${this.o.path}.tmp`;
        await Bun.write(tmp, JSON.stringify({ keys }));
        await rename(tmp, this.o.path);
    }
    private async enc(sk: SigningKey, createdAt: number): Promise<DiskKey> {
        const priv = JSON.stringify(await exportJWK(sk.privateKey));
        const { wrapped, plaintext } = await this.o.kek.generateDek();
        const blob = encryptAesGcm(Buffer.from(priv), plaintext);
        return { kid: sk.kid, publicJwk: sk.publicJwk, createdAt,
                 wrappedDek: wrapped, encPriv: serializeBlob(blob) };
    }
    private async dec(d: DiskKey): Promise<CryptoKey> {
        try {
            const dek = await this.o.kek.unwrap(d.wrappedDek);
            const json = decryptAesGcm(parseBlob(d.encPriv), dek).toString("utf8");
            return (await importJWK(JSON.parse(json), "ES256")) as CryptoKey;
        } catch (e) { throw new KeyStoreError(`cannot decrypt private key ${d.kid}: ${String(e)}`); }
    }
    private async ensure(keys: DiskKey[]): Promise<DiskKey[]> {
        if (keys.some((k) => k.retiredAt === undefined)) return keys;
        const sk = await generateSigningKey(this.o.now());
        const next = [...keys, await this.enc(sk, sk.createdAt)];
        await this.write(next);
        return next;
    }

    loadActive(): Promise<SigningKey> {
        return this._locked(async () => {
            const keys = await this.ensure(await this.read());
            const a = [...keys].reverse().find((k) => k.retiredAt === undefined)!;
            return { kid: a.kid, publicJwk: a.publicJwk, privateKey: await this.dec(a) };
        });
    }
    loadAll(): Promise<PublishedKey[]> {
        return this._locked(async () => {
            // (C) read-only for prune: filter expired-overlap keys in memory,
            // never persist here — a public JWKS GET must not write. Pruning
            // is persisted only by `prune()` / `rotate()`.
            const keys = await this.ensure(await this.read());
            return keys
                .filter((k) => !isPrunable(k, this.o.now(), this.o.keyOverlapSeconds))
                .map((k) => ({
                    kid: k.kid, publicJwk: k.publicJwk, createdAt: k.createdAt,
                    ...(k.retiredAt !== undefined ? { retiredAt: k.retiredAt } : {}),
                }));
        });
    }
    rotate(): Promise<void> {
        return this._locked(async () => {
            const keys = await this.ensure(await this.read());
            const now = this.o.now();
            for (const k of keys) if (k.retiredAt === undefined) k.retiredAt = now;
            const sk = await generateSigningKey(now);
            await this.write([...keys, await this.enc(sk, sk.createdAt)]);
        });
    }
    prune(nowSec: number): Promise<void> {
        return this._locked(async () => {
            const keys = await this.read();
            const kept = keys.filter((k) => !isPrunable(k, nowSec, this.o.keyOverlapSeconds));
            if (kept.length !== keys.length) await this.write(kept);
        });
    }
}
