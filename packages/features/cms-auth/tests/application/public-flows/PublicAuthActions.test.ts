import { expect, test } from "bun:test";
import {
    createPublicAuthActions,
    InMemoryAuthentication,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    resolveRequestSubject,
    type Authentication,
    type LocalAuthenticationActions,
    type Subject,
} from "@bernouy/cms-auth";

function fixture() {
    let reads = 0;
    const subject: Subject = { identifier: "local:member", email: "member@example.test" };
    const local: Authentication & LocalAuthenticationActions = Object.assign(new InMemoryAuthentication(subject), {
        defaultHome: "/",
        authenticate: async () => ({ ok: true as const, subject, cookie: "test-session=value" }),
        clearSession: () => "test-session=; Max-Age=0",
        getSubject: async () => {
            reads++;
            return subject;
        },
    });
    const config = {
        local,
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository(),
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
    };
    return { config, actions: createPublicAuthActions(config), reads: () => reads };
}

test("public auth is a fresh operations-only object without stores or an admin email action", () => {
    const { actions, config } = fixture();
    expect(actions).not.toBe(config);
    expect(Object.keys(actions).sort()).toEqual([
        "buildLoginUrl",
        "confirmEmailVerification",
        "confirmPasswordReset",
        "login",
        "logout",
        "requestEmailVerification",
        "requestPasswordReset",
        "signup",
        "subject",
    ]);
    for (const name of ["local", "credentials", "users", "tokens", "emailer", "emailTest", "config"]) {
        expect(actions).not.toHaveProperty(name);
    }
});

test("public actions share the underlying authentication snapshot and return isolated subjects", async () => {
    const { actions, config, reads } = fixture();
    const request = new Request("https://example.test/me");
    const [guardSubject, first, second] = await Promise.all([
        resolveRequestSubject(config.local, request),
        actions.subject(request),
        actions.subject(request),
    ]);
    expect(reads()).toBe(1);
    expect(first).toEqual(guardSubject);
    expect(first).not.toBe(second);
    first!.email = "changed@example.test";
    expect((await actions.subject(request))?.email).toBe("member@example.test");
    await actions.subject(new Request(request.url));
    expect(reads()).toBe(2);
});

test("public login and logout work with a minimal actions implementation, not a concrete backend", async () => {
    const { actions } = fixture();
    const response = await actions.login(
        new Request("https://example.test/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "member@example.test", password: "password-1" }),
        }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe("test-session=value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ subject: { identifier: "local:member", email: "member@example.test" } });
    expect(actions.logout().headers.get("set-cookie")).toContain("Max-Age=0");
});
