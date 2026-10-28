import { expect } from "bun:test";
import type { cmsMcpFixture } from "./fixture";

export async function connected(f: Awaited<ReturnType<typeof cmsMcpFixture>>) {
    const c = await f.connect();
    expect(c.consent.headers.get("referrer-policy")).toBe("same-origin");
    expect(c.consent.headers.get("content-security-policy")).toContain("form-action 'self' https://client.example");
    expect(c.html).toContain("Claude &lt;script&gt;");
    expect(c.html).not.toContain("Claude <script>");
    const consent = await f.request("/.cms/oauth/authorize", {
        method: "POST",
        headers: {
            Origin: "http://127.0.0.1:5100",
            Cookie: c.flow,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            requestId: c.requestId,
            decision: "allow",
            email: "admin@example.com",
            password: "valid-password",
        }),
    });
    expect(consent.status).toBe(303);
    expect(consent.headers.get("set-cookie")).toContain("cms-session=session-token");
    const callback = new URL(consent.headers.get("location")!);
    expect(callback.origin).toBe("https://client.example");
    expect(callback.searchParams.get("state")).toBe("expected-state");
    const exchange = await f.request("/.cms/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: callback.searchParams.get("code")!,
            client_id: c.client.client_id,
            redirect_uri: "https://client.example/callback",
            code_verifier: c.verifier,
            resource: f.resource,
        }),
    });
    expect(exchange.status).toBe(200);
    return (await exchange.json()) as { access_token: string };
}
