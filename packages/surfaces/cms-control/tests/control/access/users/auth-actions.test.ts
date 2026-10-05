import { describe, expect, test } from "bun:test";
import {
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryUsersRepository,
    createPublicAuthActions,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
} from "@bernouy/cms-auth";
import { createLocalUser } from "@bernouy/cms-auth/management";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { ControlCms } from "cms-control/ControlCms";
import markVerified from "cms-control/api/_access/users/email-verified.post";
import resendVerification from "cms-control/api/_access/users/email-verification.post";
import sendReset from "cms-control/api/_access/users/password-reset.post";
import deleteUser from "cms-control/api/_access/users/users.delete";
import listUsers from "cms-control/api/_access/users/users.get";

function setup() {
    const users = new InMemoryUsersRepository();
    const credentials = new InMemoryLocalCredentialStore();
    const pats = new InMemoryPatRepository();
    const tokens = new InMemoryAuthTokenStore();
    const emailer = new InMemoryEmailer();
    const local = new LocalAuthentication({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials,
        resolver: new SubjectResolver(users),
        codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
        cookieName: "cms-session",
    });
    const publicAuth: PublicAuthRoutesConfig = createPublicAuthActions({
        local,
        credentials,
        users,
        tokens,
        emailer,
        emailVerificationUrl: "http://control.test/auth/verify-email",
        passwordResetUrl: "http://control.test/auth/reset-password",
        authEmailCooldownSeconds: 0,
    });
    const cms = {
        users,
        credentials,
        pats,
        publicAuth,
        auth: { getSubject: async () => ({ identifier: "local:admin" }) },
        config: { administrator: async () => true },
    } as unknown as ControlCms;
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
            },
        );

        const res = await listUsers(new Request(`http://control/api/users?sub=${encodeURIComponent(user.sub)}`), cms);
        const row = (await res.json()) as {
            sub: string;
            label: string;
            providerLabel: string;
            emailStatusLabel: string;
            subParam: string;
        };

        expect(row.sub).toBe(user.sub);
        expect(row.label).toBe("detail@example.com");
        expect(row.providerLabel).toBe("Local");
        expect(row.emailStatusLabel).toBe("Verified");
        expect(row.subParam).toBe(encodeURIComponent(user.sub));
    });

    test("rejects non-local users", async () => {
        const { cms, users } = setup();
        await users.upsert({ sub: "oidc:1", provider: "oidc", email: "sso@example.com" });
        await expect(sendReset(req({ sub: "oidc:1" }), cms)).rejects.toThrow(/not a local user/);
    });

    test("deletes a member and its dependent records", async () => {
        const { cms, credentials, users } = setup();
        const user = await createLocalUser(
            { credentials, users },
            { email: "member@example.com", password: "password-1" },
        );
        const response = await deleteUser(new Request(`http://control/api/users?sub=${user.sub}`), cms);

        expect(response.status).toBe(200);
        expect(await users.getBySub(user.sub)).toBeNull();
        expect(await credentials.getByEmail("member@example.com")).toBeNull();
    });
});
