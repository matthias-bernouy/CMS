import { describe, test, expect } from "bun:test";
import type { Credential, CredentialRepository, Subject } from "src/index";
import {
    CredentialAuthentication,
    getCredential,
    requireCredential,
} from "src/credentials/CredentialAuthentication";
import { sha256Hex } from "src/utilities/crypto";

type TestCredential = Credential & { bucketId?: string };

function makeRepo(seed: TestCredential[] = []): CredentialRepository<TestCredential> & { seed: (c: TestCredential) => void } {
    const byHash = new Map<string, TestCredential>();
    const byId   = new Map<string, TestCredential>();
    for (const c of seed) { byHash.set(c.tokenHash, c); byId.set(c.id, c); }
    return {
        async create(c) { byHash.set(c.tokenHash, c); byId.set(c.id, c); },
        async get(id)   { return byId.get(id) ?? null; },
        async getByTokenHash(h) { return byHash.get(h) ?? null; },
        async update()  {},
        async delete()  {},
        seed(c) { byHash.set(c.tokenHash, c); byId.set(c.id, c); },
    };
}

async function makeCred(opts: Partial<TestCredential> & { cleartext: string }): Promise<TestCredential> {
    return {
        id:        opts.id        ?? "cred-1",
        tokenHash: await sha256Hex(opts.cleartext),
        createdAt: opts.createdAt ?? new Date(),
        ...(opts.label     !== undefined ? { label:     opts.label     } : {}),
        ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
        ...(opts.revokedAt !== undefined ? { revokedAt: opts.revokedAt } : {}),
        ...(opts.bucketId  !== undefined ? { bucketId:  opts.bucketId  } : {}),
    };
}

const mapper = (cred: TestCredential): Subject<"tenant"> => ({
    identifier: cred.id,
    role:       "tenant",
    ...(cred.label !== undefined ? { displayName: cred.label } : {}),
});

describe("CredentialAuthentication.getSubject", () => {
    test("returns null when no Authorization header", async () => {
        const auth = new CredentialAuthentication(makeRepo(), mapper);
        const subject = await auth.getSubject(new Request("http://x/y"));
        expect(subject).toBeNull();
    });

    test("returns null on malformed header (not 'Bearer X')", async () => {
        const auth = new CredentialAuthentication(makeRepo(), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Basic abc" } }));
        expect(subject).toBeNull();
    });

    test("returns null on unknown token (repo miss)", async () => {
        const auth = new CredentialAuthentication(makeRepo(), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Bearer unknown_xxx" } }));
        expect(subject).toBeNull();
    });

    test("returns Subject on valid token", async () => {
        const cred = await makeCred({ cleartext: "tok_valid", label: "ci-prod", bucketId: "b-1" });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Bearer tok_valid" } }));
        expect(subject).toEqual({ identifier: "cred-1", role: "tenant", displayName: "ci-prod" });
    });

    test("accepts case-insensitive 'Bearer' and trims whitespace", async () => {
        const cred = await makeCred({ cleartext: "tok_case" });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "  bearer   tok_case  " } }));
        expect(subject).not.toBeNull();
    });

    test("returns null when token is revoked", async () => {
        const cred = await makeCred({ cleartext: "tok_revoked", revokedAt: new Date() });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Bearer tok_revoked" } }));
        expect(subject).toBeNull();
    });

    test("returns null when token is expired", async () => {
        const past = new Date(Date.now() - 60_000);
        const cred = await makeCred({ cleartext: "tok_expired", expiresAt: past });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Bearer tok_expired" } }));
        expect(subject).toBeNull();
    });

    test("accepts token whose expiresAt is in the future", async () => {
        const future = new Date(Date.now() + 60_000);
        const cred = await makeCred({ cleartext: "tok_future", expiresAt: future });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const subject = await auth.getSubject(new Request("http://x/y", { headers: { authorization: "Bearer tok_future" } }));
        expect(subject).not.toBeNull();
    });
});

describe("getCredential / requireCredential side-channel", () => {
    test("getCredential returns the full typed entity after successful auth", async () => {
        const cred = await makeCred({ cleartext: "tok_side", bucketId: "b-42" });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const req = new Request("http://x/y", { headers: { authorization: "Bearer tok_side" } });
        await auth.getSubject(req);
        const recovered = getCredential<TestCredential>(req);
        expect(recovered).not.toBeNull();
        expect(recovered!.bucketId).toBe("b-42");
        expect(recovered!.id).toBe("cred-1");
    });

    test("getCredential returns null for a request that did not pass through auth", () => {
        expect(getCredential(new Request("http://x/y"))).toBeNull();
    });

    test("getCredential returns null when auth failed (no leak across requests)", async () => {
        const cred = await makeCred({ cleartext: "tok_x" });
        const auth = new CredentialAuthentication(makeRepo([cred]), mapper);
        const reqOk   = new Request("http://x/a", { headers: { authorization: "Bearer tok_x" } });
        const reqFail = new Request("http://x/b", { headers: { authorization: "Bearer wrong" } });
        await auth.getSubject(reqOk);
        await auth.getSubject(reqFail);
        expect(getCredential(reqOk)).not.toBeNull();
        expect(getCredential(reqFail)).toBeNull();
    });

    test("requireCredential throws when nothing is attached", () => {
        expect(() => requireCredential(new Request("http://x/y"))).toThrow(/no credential resolved/);
    });

    test("URL fields are empty (consume-only, no browser login surface)", () => {
        const auth = new CredentialAuthentication(makeRepo(), mapper);
        expect(auth.loginUrl).toBe("");
        expect(auth.logoutUrl).toBe("");
        expect(auth.profileUrl).toBe("");
        expect(auth.buildLoginUrl()).toBe("");
        expect(auth.buildLogoutUrl()).toBe("");
    });
});
