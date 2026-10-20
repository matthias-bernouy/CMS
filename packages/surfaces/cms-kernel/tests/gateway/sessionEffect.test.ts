import { describe, expect, test } from "bun:test";
import { encodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";
import { applySessionEffect } from "cms-kernel/http/session/applySessionEffect";

describe("Kernel session effects", () => {
    test("turns a semantic establish effect into the only browser cookie", () => {
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        const response = applySessionEffect(
            new Response("ok", {
                headers: {
                    [SESSION_EFFECT_HEADER]: encodeSessionEffect({
                        type: "session",
                        operation: "establish",
                        token: "session-token",
                        expiresAt,
                    }),
                    "set-cookie": "provider-controlled=forbidden",
                },
            }),
            { secure: true },
        );

        expect(response.headers.has(SESSION_EFFECT_HEADER)).toBeFalse();
        expect(response.headers.get("set-cookie")).toContain("cms-session=session-token");
        expect(response.headers.get("set-cookie")).toContain("HttpOnly");
        expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
        expect(response.headers.get("set-cookie")).toContain("Path=/");
        expect(response.headers.get("set-cookie")).toContain("Secure");
        expect(response.headers.get("set-cookie")).not.toContain("provider-controlled");
    });

    test("turns a clear effect into an expired cookie", () => {
        const response = applySessionEffect(
            new Response(null, {
                headers: {
                    [SESSION_EFFECT_HEADER]: encodeSessionEffect({ type: "session", operation: "clear" }),
                },
            }),
        );

        expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
        expect(response.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });

    test("rejects provider-controlled expiry outside the Kernel policy", () => {
        const expired = new Response(null, {
            headers: {
                [SESSION_EFFECT_HEADER]: encodeSessionEffect({
                    type: "session",
                    operation: "establish",
                    token: "session-token",
                    expiresAt: new Date(Date.now() - 60_000).toISOString(),
                }),
            },
        });
        expect(() => applySessionEffect(expired)).toThrow("outside the Kernel policy");
    });
});
