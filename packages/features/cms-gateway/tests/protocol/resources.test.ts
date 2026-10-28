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
