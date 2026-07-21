import { describe, expect, test } from "bun:test";
import {
    createLocalUser,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import markVerified from "cms-control/api/users/email-verified.post";
import resendVerification from "cms-control/api/users/email-verification.post";
import sendReset from "cms-control/api/users/password-reset.post";
import listUsers from "cms-control/api/users/users.get";
import type { CMS_ROLES } from "types/roles";

function setup() {
    const users = new InMemoryUsersRepository<CMS_ROLES>();
    const credentials = new InMemoryLocalCredentialStore();
    const tokens = new InMemoryAuthTokenStore();
    const emailer = new InMemoryEmailer();
    const local = new LocalAuthentication<CMS_ROLES>({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials,
        resolver: new SubjectResolver<CMS_ROLES>(users, "user"),
        codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
        cookieName: "cms-session",
    });
    const publicAuth: PublicAuthRoutesConfig<CMS_ROLES> = {
        local,
        credentials,
        users,
        tokens,
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "http://control.test/auth/verify-email",
        passwordResetUrl: "http://control.test/auth/reset-password",
        authEmailCooldownSeconds: 0,
    };
    const cms = { users, credentials, publicAuth } as unknown as ControlCms;
    return { cms, users, credentials, emailer };
}

const req = (body: Record<string, unknown>) =>
    new Request("http://control/api/users/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

describe("admin user auth actions", () => {
    test("resends verification and marks email verified for local users", async () => {
        const { cms, credentials, emailer } = setup();
        const user = await createLocalUser(
            { credentials, users: cms.users },
            {
                email: "ada@example.com",
                password: "password-1",
                role: "user",
                emailVerified: false,
            },
        );

        expect((await resendVerification(req({ sub: user.sub }), cms)).status).toBe(200);
        expect(emailer.sent).toHaveLength(1);
        expect(emailer.sent[0]!.text).toContain("http://control.test/auth/verify-email?token=");

        expect((await markVerified(req({ sub: user.sub }), cms)).status).toBe(200);
        expect((await credentials.getByEmail("ada@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    test("sends password reset and exposes verification status in users list", async () => {
        const { cms, credentials, emailer } = setup();
        const user = await createLocalUser(
            { credentials, users: cms.users },
            {
                email: "reset@example.com",
                password: "password-1",
                role: "user",
            },
        );

        expect((await sendReset(req({ sub: user.sub }), cms)).status).toBe(200);
        expect(emailer.sent).toHaveLength(1);
        expect(emailer.sent[0]!.text).toContain("http://control.test/auth/reset-password?token=");

        const res = await listUsers(new Request("http://control/api/users"), cms);
        const rows = (await res.json()) as Array<{ sub: string; emailVerifiedAt: string | null }>;
        expect(rows.find((row) => row.sub === user.sub)?.emailVerifiedAt).toBeTruthy();
    });

    test("returns one enriched user for the detail view", async () => {
        const { cms, credentials } = setup();
        const user = await createLocalUser(
            { credentials, users: cms.users },
            {
                email: "detail@example.com",
                password: "password-1",
                role: "user",
            },
        );

        const res = await listUsers(new Request(`http://control/api/users?sub=${encodeURIComponent(user.sub)}`), cms);
        const row = (await res.json()) as {
            sub: string;
            label: string;
            roleLabel: string;
            providerLabel: string;
            emailStatusLabel: string;
            subParam: string;
        };

        expect(row.sub).toBe(user.sub);
        expect(row.label).toBe("detail@example.com");
        expect(row.roleLabel).toBe("User");
        expect(row.providerLabel).toBe("Local");
        expect(row.emailStatusLabel).toBe("Verified");
        expect(row.subParam).toBe(encodeURIComponent(user.sub));
    });

    test("rejects non-local users", async () => {
        const { cms, users } = setup();
        await users.upsert({ sub: "oidc:1", provider: "oidc", email: "sso@example.com" }, "user");
        await expect(sendReset(req({ sub: "oidc:1" }), cms)).rejects.toThrow(/not a local user/);
    });
});
