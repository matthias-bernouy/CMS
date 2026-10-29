import { expect, test } from "bun:test";
import { parseResourceMetadata, decodeResourceMetadata } from "@bernouy/cms-gateway/protocol";
test("native metadata is closed and excludes cookies and security policy", () => {
    for (const name of [
        "set-cookie",
        "content-security-policy",
        "access-control-allow-origin",
        "vary",
        "authorization",
    ]) {
        expect(() => parseResourceMetadata({ status: 200, headers: { [name]: "untrusted" } })).toThrow();
    }
    expect(() => parseResourceMetadata({ status: 200, headers: {}, extra: true })).toThrow();
    expect(() => parseResourceMetadata({ status: 999, headers: {} })).toThrow();
    expect(() => decodeResourceMetadata(" ".repeat(16385))).toThrow();
});
test("resource redirects accept only bounded root paths or HTTP URLs", () => {
    for (const location of ["/login?returnTo=%2Fadmin", "https://site.test/home"]) {
        expect(parseResourceMetadata({ status: 302, headers: { location } }).headers.location).toBe(location);
    }
    for (const location of [
        "javascript:alert(1)",
        "data:text/html,x",
        "//evil.test",
        "/\\evil.test",
        "https://user:secret@evil.test",
        "https://site.test/ bad",
        "ftp://site.test",
        "relative",
    ]) {
        expect(() => parseResourceMetadata({ status: 302, headers: { location } })).toThrow();
    }
});

test("negotiated Vary and cache tags are bounded, immutable and cannot vary on unkeyed or credential fields", () => {
    const headers = { "content-type": "text/html" };
    const result = parseResourceMetadata({
        status: 200,
        headers,
        vary: ["accept-language"],
        cacheTags: ["content:pages"],
    });
    expect(result.vary).toEqual(["accept-language"]);
    expect(Object.isFrozen(result.cacheTags)).toBe(true);
    for (const vary of [["cookie"], ["authorization"], ["user-agent"], ["*"], ["accept", "accept"]]) {
        expect(() => parseResourceMetadata({ status: 200, headers, vary })).toThrow();
    }
    for (const cacheTags of [
        ["token secret"],
        ["x".repeat(129)],
        Array.from({ length: 33 }, (_, i) => `tag:${i}`),
        ["tag", "tag"],
    ]) {
        expect(() => parseResourceMetadata({ status: 200, headers, cacheTags })).toThrow();
    }
});
