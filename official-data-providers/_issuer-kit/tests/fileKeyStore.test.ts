import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SignJWT, jwtVerify, createLocalJWKSet, type JWK } from "jose";
import { LocalKekProvider } from "@bernouy/core";
import { FileKeyStore } from "src/default-implementation/FileKeyStore";
import { KeyStoreError } from "src/core/errors";

const kekP = () => new LocalKekProvider(randomBytes(32));
const tmp = () => join(tmpdir(), `ik-keys-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
const opts = (path: string, kek = kekP()) => ({ path, kek, now: () => 1000, keyOverlapSeconds: 100 });
const jwks = (ks: { publicJwk: JWK }[]) => createLocalJWKSet({ keys: ks.map((k) => k.publicJwk) });

test("durable: a fresh FileKeyStore (same KEK) reloads + verifies", async () => {
    const path = tmp(); const kek = kekP();
    try {
        const a = await new FileKeyStore(opts(path, kek)).loadActive();
        const tok = await new SignJWT({ t: 1 })
            .setProtectedHeader({ alg: "ES256", kid: a.kid })
            .setExpirationTime("5m").sign(a.privateKey);
        const reopened = new FileKeyStore(opts(path, kek));               // new instance
        const { payload } = await jwtVerify(tok, jwks(await reopened.loadAll()));
        expect(payload.t).toBe(1);
    } finally { await rm(path, { force: true }); }
});

test("no clear private material on disk (encrypted at rest)", async () => {
    const path = tmp();
    try {
        await new FileKeyStore(opts(path)).loadActive();
        const text = await readFile(path, "utf8");
        expect(text).toContain("encPriv");
        expect(text).toContain("wrappedDek");
        expect(text).not.toMatch(/"d"\s*:/);          // no private scalar anywhere
    } finally { await rm(path, { force: true }); }
});

test("wrong KEK → KeyStoreError (fail fast, no silent regen)", async () => {
    const path = tmp();
    try {
        await new FileKeyStore(opts(path, kekP())).loadActive();          // written with KEK A
        const other = new FileKeyStore(opts(path, kekP()));               // KEK B
        await expect(other.loadActive()).rejects.toBeInstanceOf(KeyStoreError);
    } finally { await rm(path, { force: true }); }
});

test("corrupt file → KeyStoreError", async () => {
    const path = tmp();
    try {
        await writeFile(path, "{ not json");
        await expect(new FileKeyStore(opts(path)).loadAll()).rejects.toBeInstanceOf(KeyStoreError);
    } finally { await rm(path, { force: true }); }
});

test("rotate persists; overlap then prune across instances", async () => {
    const path = tmp(); const kek = kekP(); let t = 1000;
    try {
        const o = { path, kek, now: () => t, keyOverlapSeconds: 100 };
        const s1 = new FileKeyStore(o);
        await s1.loadActive();
        await s1.rotate();
        const reopened = await new FileKeyStore(o).loadAll();
        expect(reopened.length).toBe(2);                                  // persisted overlap
        t = 1000 + 100 + 1;
        expect((await new FileKeyStore(o).loadAll()).length).toBe(1);     // pruned + persisted
    } finally { await rm(path, { force: true }); }
});

test("prune() (KeyStore API) drops retired keys past overlap, persists", async () => {
    const path = tmp(); const kek = kekP(); let t = 1000;
    try {
        const o = { path, kek, now: () => t, keyOverlapSeconds: 100 };
        const s = new FileKeyStore(o);
        await s.loadActive(); await s.rotate();          // 1 retired + 1 active
        await s.prune(1050);                              // within overlap → no-op
        expect((await new FileKeyStore(o).loadAll()).length).toBe(2);
        await s.prune(1000 + 100 + 1);                    // past overlap → drops retired
        expect((await new FileKeyStore(o).loadAll()).length).toBe(1);
    } finally { await rm(path, { force: true }); }
});

test("(A) concurrent cold-start signs only a kid present in the JWKS", async () => {
    const path = tmp();
    try {
        const s = new FileKeyStore(opts(path));
        const [a, b] = await Promise.all([s.loadActive(), s.loadActive()]);
        expect(a.kid).toBe(b.kid);                        // serialized → single key
        const published = (await s.loadAll()).map((k) => k.kid);
        expect(published).toEqual([a.kid]);               // the signing kid IS published
    } finally { await rm(path, { force: true }); }
});

test("(B) writes atomically — no leftover .tmp, file complete", async () => {
    const path = tmp();
    try {
        await new FileKeyStore(opts(path)).loadActive();
        expect(await Bun.file(`${path}.tmp`).exists()).toBe(false);   // renamed away
        const parsed = JSON.parse(await readFile(path, "utf8"));
        expect(Array.isArray(parsed.keys)).toBe(true);
        expect(parsed.keys.length).toBe(1);
    } finally { await rm(path, { force: true }); await rm(`${path}.tmp`, { force: true }); }
});

test("(C) loadAll() does not persist prune (read-only); prune() does", async () => {
    const path = tmp(); const kek = kekP(); let t = 1000;
    try {
        const o = { path, kek, now: () => t, keyOverlapSeconds: 100 };
        const s = new FileKeyStore(o);
        await s.loadActive(); await s.rotate();           // 1 retired + 1 active on disk
        t = 1000 + 100 + 1;                               // retired now prunable
        expect((await s.loadAll()).length).toBe(1);       // filtered in memory
        expect(JSON.parse(await readFile(path, "utf8")).keys.length).toBe(2); // NOT persisted
        await s.prune(t);
        expect(JSON.parse(await readFile(path, "utf8")).keys.length).toBe(1); // prune persists
    } finally { await rm(path, { force: true }); }
});

test("(E) tolerates a malformed-but-parseable key file (regenerates)", async () => {
    const path = tmp();
    try {
        await writeFile(path, "{}");                       // valid JSON, no `keys`
        const a = await new FileKeyStore(opts(path)).loadActive();   // must not throw
        expect(a.kid).toBeTruthy();
    } finally { await rm(path, { force: true }); }
});
