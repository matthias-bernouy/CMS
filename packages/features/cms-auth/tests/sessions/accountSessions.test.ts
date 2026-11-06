import { expect, test } from "bun:test";
import {
    InMemorySessionRepository,
    SessionTokenService,
    LocalAuthentication,
    SubjectResolver,
    InMemoryUsersRepository,
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryAuthTokenStore,
    confirmPasswordReset,
} from "@bernouy/cms-auth";
import { deleteUserCompletely, changeOwnPassword } from "@bernouy/cms-auth/management";
import { InMemoryEmailer } from "@bernouy/cms-emailer";

async function fixture() {
    let now = Date.now();
    const sessions = new SessionTokenService({ repository: new InMemorySessionRepository(), now: () => now });
    const credentials = new InMemoryLocalCredentialStore();
    const users = new InMemoryUsersRepository();
    const pats = new InMemoryPatRepository();
    const tokens = new InMemoryAuthTokenStore();
    const auth = new LocalAuthentication({
        providerId: "local",
        credentials,
        resolver: new SubjectResolver(users),
        sessions,
        pats,
    });
    await credentials.create({ email: "member@example.test", password: "old-password" });
    const first = await auth.authenticate("member@example.test", "old-password");
    const second = await auth.authenticate("member@example.test", "old-password");
    if (!first.ok || !second.ok) {
        throw new Error("fixture login failed");
    }
    const revokeSessionsForSub = (sub: string) => sessions.revokeForSub(sub);
    const stores = { users, credentials, pats, revokeSessionsForSub };
    return {
        auth,
        first,
        second,
        sessions,
        stores,
        tokens,
        tick: () => {
            now++;
        },
    };
}

test("logout invalidates a replayed cookie while preserving another session and PATs", async () => {
    const { auth, first, second, stores } = await fixture();
    const pat = await stores.pats.create({ sub: first.subject.identifier, name: "cli" });
    await auth.revokeCredential({ kind: "bearer", token: pat.token });
    expect(await auth.resolveCredential({ kind: "bearer", token: pat.token })).not.toBeNull();
    await auth.revokeCredential({ kind: "session", token: first.session.token });
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).toBeNull();
    expect(await auth.resolveCredential({ kind: "session", token: second.session.token })).not.toBeNull();
});

test("invalid password changes leave sessions intact; a valid change revokes them", async () => {
    const { auth, first, stores, tick } = await fixture();
    const user = (await stores.users.getBySub(first.subject.identifier))!;
    await expect(changeOwnPassword(stores, user, "wrong", "new-password")).rejects.toThrow("incorrect");
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).not.toBeNull();
    tick();
    await changeOwnPassword(stores, user, "old-password", "new-password");
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).toBeNull();
});

test("invalid recovery proofs leave sessions intact; successful recovery revokes all account sessions", async () => {
    const { auth, first, second, stores, tokens, tick } = await fixture();
    const credential = (await stores.credentials.getByEmail("member@example.test"))!;
    const cfg = {
        ...stores,
        tokens,
        emailer: new InMemoryEmailer(),
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
    };
    await expect(confirmPasswordReset(cfg, { token: "invalid", password: "new-password" })).rejects.toThrow();
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).not.toBeNull();
    const { token } = await tokens.create({
        purpose: "password_reset",
        sub: credential.sub,
        expiresAt: new Date(Date.now() + 60000),
    });
    tick();
    await confirmPasswordReset(cfg, { token, password: "new-password" });
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).toBeNull();
    expect(await auth.resolveCredential({ kind: "session", token: second.session.token })).toBeNull();
    tick();
    expect(await auth.authenticate("member@example.test", "new-password")).toMatchObject({ ok: true });
});

test("refused account deletion preserves sessions, and deletion revokes them before membership removal", async () => {
    const { auth, first, sessions, stores } = await fixture();
    const user = (await stores.users.getBySub(first.subject.identifier))!;
    await expect(
        deleteUserCompletely(
            {
                ...stores,
                withUserDeletion: async () => {
                    throw new Error("still owns resources");
                },
            },
            user,
        ),
    ).rejects.toThrow("still owns resources");
    expect(await sessions.readToken(first.session.token)).not.toBeNull();
    await deleteUserCompletely(stores, user);
    expect(await sessions.readToken(first.session.token)).toBeNull();
    expect(await auth.resolveCredential({ kind: "session", token: first.session.token })).toBeNull();
});
