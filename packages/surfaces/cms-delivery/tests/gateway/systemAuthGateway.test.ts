import { describe, expect, test } from "bun:test";
import DeliveryCms from "cms-delivery/DeliveryCms";
import {
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemorySourceRepository, type SourceEndpointInterceptor } from "@bernouy/cms-sources";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { getRequestIP, requestCorrelationId, setRequestIP } from "@bernouy/http-runner";
import { CaptureRunner } from "./support/CaptureRunner";

type Role = "user";

async function setup(
    options: {
        blockSignup?: boolean;
        blockResponseSignup?: boolean;
        installResponseTrigger?: boolean;
        sourceImageInterceptor?: SourceEndpointInterceptor;
    } = {},
) {
    const runner = new CaptureRunner();
    const users = new InMemoryUsersRepository<Role>();
    const credentials = new InMemoryLocalCredentialStore();
    const emailer = new InMemoryEmailer();
    const resolver = new SubjectResolver<Role>(users, "user");
    const auth: PublicAuthRoutesConfig<Role> = {
        local: new LocalAuthentication<Role>({
            providerId: "local",
            loginPagePath: "/login",
            logoutPath: "/.cms/auth/logout",
            credentials,
            resolver,
            codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
            cookieName: "site-session",
        }),
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "http://site.test/auth/verify-email",
        passwordResetUrl: "http://site.test/auth/reset-password",
        authEmailCooldownSeconds: 0,
    };
    const gateway = new InMemorySourceRepository();
    const roles = new InMemoryRolesRepository();
    const functions = new InMemoryFunctionRepository();
    const triggers = new InMemoryTriggerRepository();
    await functions.createFunction({
        id: "record-signup-subject",
        method: "POST",
        input: {
            body: {
                type: "object",
                properties: { cmsUserId: { type: "string" } },
                required: ["cmsUserId"],
            },
        },
        steps: [],
        return: { status: 204 },
    });
    if (options.installResponseTrigger !== false) {
        await triggers.createTrigger({
            id: "record-signup-subject",
            enabled: true,
            event: { kind: "endpoint", source: "system-auth", endpoint: "signup", phase: "response" },
            mode: "sync",
            failureMode: "block",
            condition: { exists: "$response.body.cmsUserId" },
            function: {
                id: "record-signup-subject",
                body: { cmsUserId: "$response.body.cmsUserId" },
            },
        });
    }
    if (options.blockSignup) {
        await triggers.createTrigger({
            id: "block-signup",
            enabled: true,
            event: { kind: "endpoint", source: "system-auth", endpoint: "signup", phase: "request" },
            mode: "sync",
            failureMode: "block",
            function: { id: "missing-signup-policy" },
        });
    }
    if (options.blockResponseSignup) {
        await triggers.createTrigger({
            id: "block-signup-response",
            enabled: true,
            event: { kind: "endpoint", source: "system-auth", endpoint: "signup", phase: "response" },
            mode: "sync",
            failureMode: "block",
            condition: { exists: "$response.body.cmsUserId" },
            function: { id: "missing-signup-commit" },
        });
    }
    new DeliveryCms({
        runner,
        repository: {} as any,
        auth,
        sources: gateway,
        roles,
        functions,
        triggers,
        ...(options.sourceImageInterceptor ? { sourceImageInterceptor: options.sourceImageInterceptor } : {}),
    });
    return {
        emailer,
        credentials,
        users,
        triggers,
        get: runner.defaultHandler("GET", "/.cms/sources"),
        post: runner.defaultHandler("POST", "/.cms/sources"),
        legacySignup: runner.endpointHandler("POST", "/.cms/auth/signup"),
    };
}

describe("Delivery system auth gateway", () => {
    test("adds the system auth overlay to a plain user source repository", async () => {
        const { post, legacySignup, credentials } = await setup({ installResponseTrigger: false });

        expect(
            (await post(jsonRequest("/signup", { email: "source@example.com", password: "password-1" }))).status,
        ).toBe(200);
        expect(
            (
                await legacySignup(
                    new Request("http://site/.cms/auth/signup", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ email: "legacy@example.com", password: "password-1" }),
                    }),
                )
            ).status,
        ).toBe(200);
        expect(await credentials.getByEmail("source@example.com")).not.toBeNull();
        expect(await credentials.getByEmail("legacy@example.com")).not.toBeNull();
    });

    test("signup, verification, login, me and logout run through system-auth", async () => {
        const { post, get, emailer, triggers } = await setup();

        const signup = await post(jsonRequest("/signup", { email: "Ada@Example.com", password: "password-1" }));
        expect(signup.status).toBe(200);
        expect(await signup.clone().json()).toEqual({ ok: true });
        expect((await triggers.getTrigger("record-signup-subject"))?.lastRun?.status).toBe("ok");
        expect(emailer.sent).toHaveLength(1);

        const blocked = await post(jsonRequest("/login", { email: "ada@example.com", password: "password-1" }));
        expect(blocked.status).toBe(401);
        expect(blocked.headers.get("set-cookie")).toBeNull();

        const token = tokenFrom(emailer.sent[0]!.text);
        expect((await post(jsonRequest("/confirmEmailVerification", { token }))).status).toBe(200);

        const loggedIn = await post(jsonRequest("/login", { email: "ada@example.com", password: "password-1" }));
        expect(loggedIn.status).toBe(200);
        const cookie = sessionCookie(loggedIn);
        expect(cookie).toContain("site-session=");

        const me = await get(new Request(url("/me"), { headers: { cookie } }));
        expect(((await me.json()) as { subject: { email: string; role: string } | null }).subject).toMatchObject({
            email: "ada@example.com",
            role: "user",
        });

        const logout = await post(jsonRequest("/logout", {}));
        expect(logout.status).toBe(200);
        expect(logout.headers.get("set-cookie")).toContain("site-session=");
    });

    test("password reset runs through system-auth and verifies the credential", async () => {
        const { post, emailer, credentials } = await setup();

        await post(jsonRequest("/signup", { email: "reset@example.com", password: "old-password" }));
        expect((await post(jsonRequest("/requestPasswordReset", { email: "reset@example.com" }))).status).toBe(200);
        expect(emailer.sent.at(-1)?.text).toContain("http://site.test/auth/reset-password?token=");

        const token = tokenFrom(emailer.sent.at(-1)!.text);
        expect((await post(jsonRequest("/confirmPasswordReset", { token, password: "new-password" }))).status).toBe(
            200,
        );
        expect((await credentials.getByEmail("reset@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(
            (await post(jsonRequest("/login", { email: "reset@example.com", password: "old-password" }))).status,
        ).toBe(401);
        expect(
            (await post(jsonRequest("/login", { email: "reset@example.com", password: "new-password" }))).status,
        ).toBe(200);
    });

    test("finalizes signup when the trigger runtime is configured without endpoint triggers", async () => {
        const { post, users, emailer } = await setup({ installResponseTrigger: false });

        const response = await post(jsonRequest("/signup", { email: "plain@example.com", password: "password-1" }));

        expect(response.status).toBe(200);
        expect((await users.list()).users).toHaveLength(1);
        expect(emailer.sent).toHaveLength(1);
    });

    test("keeps credentials pending until blocking response triggers succeed on canonical and legacy routes", async () => {
        const { post, legacySignup, credentials, users, emailer, triggers } = await setup({
            blockResponseSignup: true,
        });
        const canonicalRequest = jsonRequest("/signup", {
            email: "canonical-pending@example.com",
            password: "password-1",
        });
        const legacyRequest = new Request("http://site/.cms/auth/signup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "legacy-pending@example.com", password: "password-1" }),
        });

        expect((await post(canonicalRequest)).status).toBe(502);
        expect((await legacySignup(legacyRequest)).status).toBe(502);
        const canonicalCredential = await credentials.getByEmail("canonical-pending@example.com");
        const legacyCredential = await credentials.getByEmail("legacy-pending@example.com");
        expect(canonicalCredential).not.toBeNull();
        expect(legacyCredential).not.toBeNull();
        expect((await users.list()).users).toEqual([]);
        expect(emailer.sent).toEqual([]);

        await triggers.deleteTrigger("block-signup-response");
        expect(
            (
                await post(
                    jsonRequest("/signup", {
                        email: "canonical-pending@example.com",
                        password: "password-1",
                    }),
                )
            ).status,
        ).toBe(200);
        expect(
            (
                await legacySignup(
                    new Request("http://site/.cms/auth/signup", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            email: "legacy-pending@example.com",
                            password: "password-1",
                        }),
                    }),
                )
            ).status,
        ).toBe(200);
        expect((await users.list()).users.map((user) => user.sub).sort()).toEqual(
            [`local:${canonicalCredential!.sub}`, `local:${legacyCredential!.sub}`].sort(),
        );
        expect(emailer.sent).toHaveLength(2);
    });

    test("preserves request correlation and peer IP when the legacy route enters the source gateway", async () => {
        let canonicalCorrelation: string | undefined;
        let canonicalIP: string | undefined;
        const { legacySignup } = await setup({
            sourceImageInterceptor: async (_endpoint, request, next) => {
                canonicalCorrelation = requestCorrelationId(request);
                canonicalIP = getRequestIP(request);
                return next(request);
            },
        });
        const request = new Request("http://site/.cms/auth/signup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "context@example.com", password: "password-1" }),
        });
        setRequestIP(request, "203.0.113.42");
        const correlation = requestCorrelationId(request);

        expect((await legacySignup(request)).status).toBe(200);
        expect(canonicalCorrelation).toBe(correlation);
        expect(canonicalIP).toBe("203.0.113.42");
    });

    test("applies the same blocking signup trigger to canonical and legacy routes", async () => {
        const { post, legacySignup, credentials } = await setup({ blockSignup: true });

        const canonical = await post(
            jsonRequest("/signup", {
                email: "canonical@example.com",
                password: "password-1",
                consentVersionIds: ["version-1"],
            }),
        );
        const legacy = await legacySignup(
            new Request("http://site/.cms/auth/signup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    email: "legacy@example.com",
                    password: "password-1",
                    consentVersionIds: ["version-1"],
                }),
            }),
        );

        expect(canonical.status).toBe(502);
        expect(legacy.status).toBe(502);
        expect(await credentials.getByEmail("canonical@example.com")).toBeNull();
        expect(await credentials.getByEmail("legacy@example.com")).toBeNull();
    });
});

function jsonRequest(endpoint: string, body: unknown): Request {
    return new Request(url(endpoint), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function url(endpoint: string): string {
    return `http://site/.cms/sources/system-auth${endpoint}`;
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
