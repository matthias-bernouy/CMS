import { expect } from "bun:test";

export function repositoryApi(origin: string) {
    const request = (
        contract: string,
        path: string,
        method = "GET",
        body?: unknown,
        credentials: { token?: string; cookie?: string } = {},
    ) =>
        fetch(`${origin}/.cms/call/${contract}${path}`, {
            method,
            redirect: "manual",
            headers: {
                origin,
                ...(body === undefined ? {} : { "content-type": "application/json" }),
                ...(credentials.token ? { authorization: `Bearer ${credentials.token}` } : {}),
                ...(credentials.cookie ? { cookie: credentials.cookie } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(30_000),
        });
    return {
        request,
        async session(email: string, password: string) {
            const response = await request("ulvia.cms.access", "/login-password", "POST", { email, password });
            expect(response.status).toBe(200);
            const body = await response.json();
            const cookie = response.headers
                .getSetCookie()
                .map((value) => value.split(";")[0]!)
                .join("; ");
            expect(cookie.length).toBeGreaterThan(0);
            return { cookie, accountId: body.subjectId as string, administrator: body.administrator as boolean };
        },
        async signup(email: string, password: string) {
            const response = await request("ulvia.cms.access", "/signup", "POST", { email, password });
            expect(response.status).toBe(200);
            return this.session(email, password);
        },
        async pat(cookie: string, expiresAt?: string) {
            const response = await request(
                "ulvia.cms.access",
                "/personal-access-tokens",
                "POST",
                { name: "Repository journey", ...(expiresAt ? { expiresAt } : {}) },
                { cookie },
            );
            expect(response.status).toBe(200);
            const body = await response.json();
            expect(typeof body.token).toBe("string");
            return { token: body.token as string, id: body.metadata.id as string };
        },
    };
}
