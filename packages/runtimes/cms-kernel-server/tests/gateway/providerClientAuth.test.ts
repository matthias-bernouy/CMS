import { expect, test } from "bun:test";
import { clientFixture } from "./providerClient.fixture";

test("projects authentication behavior without exposing Provider credentials", async () => {
    const { client, requests } = clientFixture((request) => {
        const path = request.url.pathname;
        if (path.endsWith("/auth/login")) {
            return Response.json(
                { subject: { identifier: "subject-a" }, cookie: "cms-session=session-a" },
                { headers: { "set-cookie": "ignored-by-client" } },
            );
        }
        if (path.endsWith("/auth/signup")) {
            return new Response(null, { status: 204 });
        }
        return Response.json({ value: { identifier: "subject-a" } });
    });

    expect(client.authentication.buildLoginUrl("/admin?a=1")).toBe("/login?returnTo=%2Fadmin%3Fa%3D1");
    expect(client.authentication.buildLogoutUrl("/bye")).toBe("/auth/logout?returnTo=%2Fbye");
    await client.authentication.getSubject(
        new Request("https://kernel.test/admin", {
            headers: { authorization: "Bearer actor", cookie: "cms-session=session-a" },
        }),
    );
    expect(await client.localAuthentication.authenticate("admin@example.test", "password")).toEqual({
        ok: true,
        subject: { identifier: "subject-a" },
        cookie: "cms-session=session-a",
    });
    expect(client.localAuthentication.clearSession()).toContain("; Secure");
    expect(client.publicAuth.buildLoginUrl("/admin")).toBe("/login?returnTo=%2Fadmin");
    expect((await client.publicAuth.login(new Request("https://kernel.test/login"))).status).toBe(200);
    expect((await client.publicAuth.logout()).headers.get("set-cookie")).toContain("Max-Age=0");
    await client.publicAuth.subject(new Request("https://kernel.test/profile"));
    await client.publicAuth.signup({ email: "new@example.test", password: "password" });

    const subjectQuery = requests.find((request) => request.body?.operation === "auth.subject");
    expect(subjectQuery?.body?.input).toEqual({
        cookie: "cms-session=session-a",
        authorization: "Bearer actor",
    });
    expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe("Bearer provider-token-at-least-twenty");
});

test("normalizes remote authentication failures and forwards public account actions", async () => {
    let loginAttempt = 0;
    const { client, requests } = clientFixture((request) => {
        if (request.url.pathname.endsWith("/auth/login")) {
            loginAttempt += 1;
            if (loginAttempt === 1) {
                return Response.json({ error: "rate_limited" }, { status: 429 });
            }
            if (loginAttempt === 2) {
                return Response.json({ subject: { identifier: "subject-a" } });
            }
            return Response.json({ error: "invalid_credentials" }, { status: 401 });
        }
        return new Response(null, { status: 204 });
    }, "http://kernel.test");

    expect(await client.localAuthentication.authenticate("admin@example.test", "wrong")).toEqual({
        ok: false,
        error: "rate_limited",
    });
    expect(await client.localAuthentication.authenticate("admin@example.test", "password")).toEqual({
        ok: false,
        error: "invalid_credentials",
    });
    expect(client.localAuthentication.clearSession()).not.toContain("; Secure");
    const failedLogin = await client.publicAuth.login(new Request("http://kernel.test/login"));
    expect(failedLogin.status).toBe(401);
    expect(await failedLogin.json()).toEqual({ error: "invalid_credentials" });
    await client.publicAuth.requestEmailVerification({ email: "admin@example.test" });
    await client.publicAuth.confirmEmailVerification({ token: "token" });
    await client.publicAuth.requestPasswordReset({ email: "admin@example.test" });
    await client.publicAuth.confirmPasswordReset({ token: "token", password: "new-password" });

    expect(requests.map((request) => request.url.pathname)).toContain("/ulvia/kernel/v1/auth/confirm-password-reset");
});

test("rejects failed Provider queries and public authentication actions", async () => {
    const { client } = clientFixture((request) =>
        request.url.pathname.endsWith("/query")
            ? Response.json({ error: "not_ready" }, { status: 503 })
            : Response.json({ error: "invalid" }, { status: 400 }),
    );

    await expect(client.query("content.revision")).rejects.toThrow("Provider query failed (503)");
    await expect(client.publicAuth.signup({ email: "new@example.test", password: "password" })).rejects.toThrow(
        "Provider authentication failed (400)",
    );
});
