import { describe, expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest, type TestServer } from "@bernouy/http-runner/testing";
import {
    EmailConfigurationError,
    type Emailer,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    registerPublicAuthRoutes,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";

type Role = "user" | "admin";

function setup(opts: { authEmailCooldownSeconds?: number; emailer?: Emailer } = {}) {
    const runner = new BunRunner();
    const users = new InMemoryUsersRepository<Role>();
    const credentials = new InMemoryLocalCredentialStore();
    const tokens = new InMemoryAuthTokenStore();
    const captureEmailer = new InMemoryEmailer();
    const emailer = opts.emailer ?? captureEmailer;
    const resolver = new SubjectResolver<Role>(users, "user");
    const local = new LocalAuthentication<Role>({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/.cms/auth/logout",
        credentials,
        resolver,
        codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
        cookieName: "site-session",
        defaultHome: "/",
    });
    const cfg: PublicAuthRoutesConfig<Role> = {
        local,
        credentials,
        users,
        tokens,
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "http://site.test/auth/verify-email",
        passwordResetUrl: "http://site.test/auth/reset-password",
        ...opts,
    };
    registerPublicAuthRoutes(runner, cfg);
    const server = serveForTest(runner);
    return { server, credentials, emailer: captureEmailer };
}

describe("public auth routes", () => {
    test("signup sends verification, blocks login, then verified login creates a session", async () => {
        const { server, credentials, emailer } = setup();
        try {
            expect((await post(server, "/signup", { email: "A@X.com", password: "password-1" })).status).toBe(200);
            expect(emailer.sent.length).toBe(1);
            expect(emailer.sent[0]!.subject).toContain("Verify your email");
            expect(emailer.sent[0]!.text).toContain("http://site.test/auth/verify-email?token=");
            expect((await credentials.getByEmail("a@x.com"))?.emailVerifiedAt).toBeNull();

            const blocked = await post(server, "/login", { email: "a@x.com", password: "password-1" });
            expect(blocked.status).toBe(401);
            expect(blocked.headers.get("set-cookie")).toBeNull();

            const token = tokenFrom(emailer.sent[0]!.text);
            expect((await post(server, "/email/verification/confirm", { token })).status).toBe(200);
            expect((await credentials.getByEmail("a@x.com"))?.emailVerifiedAt).toBeInstanceOf(Date);

            const loggedIn = await post(server, "/login", { email: "a@x.com", password: "password-1" });
            expect(loggedIn.status).toBe(200);
            const cookie = sessionCookie(loggedIn);
            expect(cookie).toContain("site-session=");
            expect(((await loggedIn.json()) as { subject: { email: string; role: string } }).subject).toMatchObject({
                email: "a@x.com",
                role: "user",
            });

            const me = await server.request("GET", "/me", { headers: { cookie } });
            expect(((await me.json()) as { subject: { email: string; role: string } | null }).subject).toMatchObject({
                email: "a@x.com",
                role: "user",
            });

            const logout = await post(server, "/logout", {});
            expect(logout.status).toBe(200);
            expect(logout.headers.get("set-cookie")).toContain("site-session=");
        } finally {
            server.stop();
        }
    });

    test("signup skips verification when email delivery is disabled", async () => {
        const { server, credentials } = setup({ emailer: disabledEmailer() });
        try {
            expect(
                (
                    await post(server, "/signup", {
                        email: "disabled@x.com",
                        password: "password-1",
                    })
                ).status,
            ).toBe(200);
            expect((await credentials.getByEmail("disabled@x.com"))?.emailVerifiedAt).toBeInstanceOf(Date);

            const loggedIn = await post(server, "/login", {
                email: "disabled@x.com",
                password: "password-1",
            });
            expect(loggedIn.status).toBe(200);
        } finally {
            server.stop();
        }
    });

    test("auth email request endpoints no-op when email delivery is disabled", async () => {
        const { server } = setup({ emailer: disabledEmailer() });
        try {
            expect((await post(server, "/password/reset/request", { email: "unknown@x.com" })).status).toBe(200);
            expect((await post(server, "/email/verification/request", { email: "unknown@x.com" })).status).toBe(200);
        } finally {
            server.stop();
        }
    });

    test("password reset changes the password and verifies the credential", async () => {
        const { server, credentials, emailer } = setup();
        try {
            await post(server, "/signup", { email: "reset@x.com", password: "old-password" });
            expect((await post(server, "/password/reset/request", { email: "reset@x.com" })).status).toBe(200);
            expect(emailer.sent.length).toBe(2);
            expect(emailer.sent[1]!.subject).toContain("Reset your password");
            expect(emailer.sent[1]!.text).toContain("http://site.test/auth/reset-password?token=");

            const token = tokenFrom(emailer.sent[1]!.text);
            expect((await post(server, "/password/reset/confirm", { token, password: "new-password" })).status).toBe(
                200,
            );
            expect((await credentials.getByEmail("reset@x.com"))?.emailVerifiedAt).toBeInstanceOf(Date);

            expect((await post(server, "/login", { email: "reset@x.com", password: "old-password" })).status).toBe(401);
            expect((await post(server, "/login", { email: "reset@x.com", password: "new-password" })).status).toBe(200);
        } finally {
            server.stop();
        }
    });

    test("request endpoints return generic success for unknown emails", async () => {
        const { server, emailer } = setup();
        try {
            expect((await post(server, "/email/verification/request", { email: "ghost@x.com" })).status).toBe(200);
            expect((await post(server, "/password/reset/request", { email: "ghost@x.com" })).status).toBe(200);
            expect(emailer.sent.length).toBe(0);
        } finally {
            server.stop();
        }
    });

    test("request endpoints do not resend during cooldown", async () => {
        const { server, emailer } = setup();
        try {
            await post(server, "/signup", { email: "cooldown@x.com", password: "password-1" });
            expect(emailer.sent.length).toBe(1);

            expect((await post(server, "/email/verification/request", { email: "cooldown@x.com" })).status).toBe(200);
            expect(emailer.sent.length).toBe(1);

            expect((await post(server, "/password/reset/request", { email: "cooldown@x.com" })).status).toBe(200);
            expect(emailer.sent.length).toBe(2);
            expect((await post(server, "/password/reset/request", { email: "cooldown@x.com" })).status).toBe(200);
            expect(emailer.sent.length).toBe(2);
        } finally {
            server.stop();
        }
    });

    test("cooldown can be disabled by config", async () => {
        const { server, emailer } = setup({ authEmailCooldownSeconds: 0 });
        try {
            await post(server, "/signup", { email: "repeat@x.com", password: "password-1" });
            await post(server, "/email/verification/request", { email: "repeat@x.com" });
            expect(emailer.sent.length).toBe(2);
        } finally {
            server.stop();
        }
    });
});

function post(server: TestServer, path: string, body: unknown): Promise<Response> {
    return server.request("POST", path, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function tokenFrom(text: string): string {
    const match = /https?:\/\/\S+/.exec(text);
    if (!match) {
        throw new Error(`missing URL in ${text}`);
    }
    const token = new URL(match[0]).searchParams.get("token");
    if (!token) {
        throw new Error(`missing token in ${match[0]}`);
    }
    return token;
}

function sessionCookie(res: Response): string {
    return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function disabledEmailer(): Emailer {
    return {
        isEnabled: async () => false,
        send: async () => {
            throw new EmailConfigurationError("Email delivery is disabled.", "disabled");
        },
    };
}
