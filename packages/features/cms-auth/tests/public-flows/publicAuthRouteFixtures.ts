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

export function setupPublicAuthRoutes(opts: { authEmailCooldownSeconds?: number; emailer?: Emailer } = {}) {
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
    const config: PublicAuthRoutesConfig<Role> = {
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
    registerPublicAuthRoutes(runner, config);
    const server = serveForTest(runner);
    return { server, credentials, users, emailer: captureEmailer };
}

export function post(server: TestServer, path: string, body: unknown): Promise<Response> {
    return server.request("POST", path, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export function tokenFrom(text: string): string {
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

export function sessionCookie(response: Response): string {
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

export function disabledEmailer(): Emailer {
    return {
        isEnabled: async () => false,
        send: async () => {
            throw new EmailConfigurationError("Email delivery is disabled.", "disabled");
        },
    };
}
