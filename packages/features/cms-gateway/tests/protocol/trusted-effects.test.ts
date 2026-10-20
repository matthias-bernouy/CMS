import { describe, expect, test } from "bun:test";
import {
    actorCredentialFromRequest,
    decodeActorCredential,
    decodeSessionEffect,
    encodeActorCredential,
    encodeSessionEffect,
} from "@bernouy/cms-gateway/protocol";

describe("trusted capability metadata", () => {
    test("round-trips actor credentials and semantic session effects", () => {
        expect(decodeActorCredential(encodeActorCredential({ kind: "session", token: "session-token" }))).toEqual({
            kind: "session",
            token: "session-token",
        });
        expect(
            decodeSessionEffect(
                encodeSessionEffect({
                    type: "session",
                    operation: "establish",
                    token: "opaque-session",
                    expiresAt: "2030-01-01T00:00:00.000Z",
                }),
            ),
        ).toEqual({
            type: "session",
            operation: "establish",
            token: "opaque-session",
            expiresAt: "2030-01-01T00:00:00.000Z",
        });
        expect(decodeSessionEffect(encodeSessionEffect({ type: "session", operation: "clear" }))).toEqual({
            type: "session",
            operation: "clear",
        });
    });

    test("gives an explicit Bearer credential precedence over the session cookie", () => {
        const request = new Request("https://kernel.test/admin", {
            headers: {
                authorization: "Bearer personal-access-token",
                cookie: "cms-session=session-token; unrelated=value",
            },
        });

        expect(actorCredentialFromRequest(request)).toEqual({ kind: "bearer", token: "personal-access-token" });
        expect(
            actorCredentialFromRequest(
                new Request("https://kernel.test/admin", { headers: { cookie: "cms-session=session-token" } }),
            ),
        ).toEqual({ kind: "session", token: "session-token" });
    });

    test("rejects malformed, oversized and control-bearing metadata", () => {
        expect(() => decodeActorCredential("not*base64url")).toThrow("metadata is invalid");
        expect(() => encodeActorCredential({ kind: "bearer", token: "bad token" })).toThrow(
            "Opaque credential is invalid",
        );
        expect(() =>
            encodeSessionEffect({
                type: "session",
                operation: "establish",
                token: "token",
                expiresAt: "not-a-date",
            }),
        ).toThrow("expiry is invalid");
    });
});
