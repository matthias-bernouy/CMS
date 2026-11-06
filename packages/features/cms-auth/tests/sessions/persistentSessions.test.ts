import { describe, expect, test } from "bun:test";
import { InMemorySessionRepository, SessionTokenService, MAX_ACCOUNT_SESSIONS } from "@bernouy/cms-auth";

const DAY = 86400_000;
function fixture() {
    let time = Date.now();
    const repository = new InMemorySessionRepository();
    const sessions = new SessionTokenService({ repository, now: () => time });
    return {
        repository,
        sessions,
        advance: (days: number) => {
            time += days * DAY;
        },
        now: () => time,
    };
}

describe("persistent browser sessions", () => {
    test("uses a fixed 30-day cookie, accepts activity before seven days, and refuses the exact idle boundary", async () => {
        const scope = fixture();
        const login = (await scope.sessions.issue("account"))!;
        expect(login.expiresAt).toBe(new Date(scope.now() + 30 * DAY).toISOString());
        scope.advance(6);
        expect(await scope.sessions.readToken(login.token)).toEqual({ sub: "account" });
        scope.advance(6);
        expect(await scope.sessions.readToken(login.token)).toEqual({ sub: "account" });
        scope.advance(7);
        expect(await scope.sessions.readToken(login.token)).toBeNull();
        expect(await scope.sessions.readToken(login.token)).toBeNull();
    });

    test("activity never moves the absolute 30-day boundary", async () => {
        const scope = fixture();
        const login = (await scope.sessions.issue("account"))!;
        for (let day = 1; day < 30; day++) {
            scope.advance(1);
            expect(await scope.sessions.readToken(login.token)).toEqual({ sub: "account" });
        }
        scope.advance(1);
        expect(await scope.sessions.readToken(login.token)).toBeNull();
    });

    test("logout revokes only its session, and another instance cannot resolve or revoke it", async () => {
        const scope = fixture();
        const first = (await scope.sessions.issue("account"))!;
        const second = (await scope.sessions.issue("account"))!;
        const otherInstance = new SessionTokenService({ repository: new InMemorySessionRepository() });
        expect(await otherInstance.readToken(first.token)).toBeNull();
        await otherInstance.revoke(first.token);
        expect(await scope.sessions.readToken(first.token)).not.toBeNull();
        await scope.sessions.revoke(first.token);
        await scope.sessions.revoke(first.token);
        expect(await scope.sessions.readToken(first.token)).toBeNull();
        expect(await scope.sessions.readToken(second.token)).toEqual({ sub: "account" });
    });

    test("account revocation fences pending password proofs and does not affect another account", async () => {
        const scope = fixture();
        const account = (await scope.sessions.issue("account"))!;
        const other = (await scope.sessions.issue("other"))!;
        const proofStartedAt = scope.now();
        scope.advance(1);
        await scope.sessions.revokeForSub("account");
        expect(await scope.sessions.readToken(account.token)).toBeNull();
        // A proof outside the five-minute issue window is never accepted.
        await expect(scope.sessions.issue("account", proofStartedAt)).rejects.toThrow("authentication proof");
        expect(await scope.sessions.issue("account", scope.now() - 1)).toBeNull();
        expect(await scope.sessions.readToken(other.token)).toEqual({ sub: "other" });
        scope.advance(1 / DAY);
        expect(await scope.sessions.issue("account")).not.toBeNull();
    });

    test("retains at most twenty sessions and rejects malformed or old signed tokens before storage", async () => {
        const scope = fixture();
        const logins = [];
        for (let index = 0; index < MAX_ACCOUNT_SESSIONS + 1; index++) {
            logins.push((await scope.sessions.issue("account"))!);
        }
        expect(await scope.sessions.readToken(logins[0]!.token)).toBeNull();
        expect(await scope.sessions.readToken(logins.at(-1)!.token)).not.toBeNull();
        scope.repository.touch = async () => {
            throw new Error("must not read storage");
        };
        for (const token of ["", "session_bad", "signed.payload", "session_" + "a".repeat(4096)]) {
            expect(await scope.sessions.readToken(token)).toBeNull();
        }
    });

    test("concurrent touches cannot recreate a revoked session", async () => {
        const scope = fixture();
        const login = (await scope.sessions.issue("account"))!;
        await Promise.all([scope.sessions.readToken(login.token), scope.sessions.revoke(login.token)]);
        expect(await scope.sessions.readToken(login.token)).toBeNull();
        expect(
            () =>
                new SessionTokenService({
                    repository: scope.repository,
                    idleTimeoutSeconds: 2,
                    absoluteTimeoutSeconds: 1,
                }),
        ).toThrow();
    });
});

test("an out-of-order server timestamp cannot shorten the inactivity window", async () => {
    const scope = fixture();
    const login = (await scope.sessions.issue("account"))!;
    scope.advance(2);
    expect(await scope.sessions.readToken(login.token)).not.toBeNull();
    scope.advance(-1);
    expect(await scope.sessions.readToken(login.token)).not.toBeNull();
    scope.advance(7);
    expect(await scope.sessions.readToken(login.token)).not.toBeNull();
});
