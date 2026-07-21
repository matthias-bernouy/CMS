import { describe, expect, test } from "bun:test";
import { privateAuthJsonResponse, privateAuthResponse } from "cms-auth/http/authResponse";

describe("private auth responses", () => {
    test("forces private no-store headers and merges Vary case-insensitively", async () => {
        const response = privateAuthJsonResponse({ ok: true }, 201, {
            "cache-control": "public, max-age=600",
            vary: "Accept-Language, cookie",
        });

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("vary")).toBe("Accept-Language, cookie, Authorization");
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(await response.json()).toEqual({ ok: true });
    });

    test("preserves redirects and every Set-Cookie value", () => {
        const headers = new Headers({ Location: "/admin" });
        headers.append("Set-Cookie", "cms-session=session-token; HttpOnly");
        headers.append("Set-Cookie", "oidc-flight=; Max-Age=0");

        const response = privateAuthResponse(null, { status: 302, headers });

        expect(response.status).toBe(302);
        expect(response.body).toBeNull();
        expect(response.headers.get("location")).toBe("/admin");
        expect(response.headers.getSetCookie()).toEqual([
            "cms-session=session-token; HttpOnly",
            "oidc-flight=; Max-Age=0",
        ]);
        expectPrivatePolicy(response);
    });

    test("keeps a stronger wildcard Vary policy", () => {
        const response = privateAuthResponse("not found", {
            status: 404,
            headers: { Vary: "*" },
        });

        expect(response.status).toBe(404);
        expect(response.headers.get("vary")).toBe("*");
        expectPrivatePolicy(response);
    });
});

function expectPrivatePolicy(response: Response): void {
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}
