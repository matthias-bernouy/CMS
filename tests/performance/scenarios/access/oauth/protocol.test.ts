import { expect, test } from "bun:test";
import { oauthDocument, oauthRedirect, oauthSuccess } from "./protocol";

test("OAuth envelopes never count protocol refusals as nominal success and retain exact callback state", () => {
    const refused = { resultJson: JSON.stringify({ error: "invalid_grant", status: 400 }) };
    expect(oauthDocument(refused).error).toBe("invalid_grant");
    expect(() => oauthSuccess(refused)).toThrow();
    const callback = "http://localhost:1234/performance-oauth";
    expect(
        oauthRedirect({ redirectUri: `${callback}?state=expected&code=code` }, callback, "expected").searchParams.get(
            "code",
        ),
    ).toBe("code");
    expect(() => oauthRedirect({ redirectUri: `${callback}?state=foreign` }, callback, "expected")).toThrow();
    expect(() =>
        oauthRedirect({ redirectUri: "http://localhost:9999/performance-oauth?state=expected" }, callback, "expected"),
    ).toThrow();
});
