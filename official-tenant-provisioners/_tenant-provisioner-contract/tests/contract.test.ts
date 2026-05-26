import { test, expect } from "bun:test";
import { metadocPath, sameOrigin } from "src/index";

test("metadocPath: appends the RFC 8414 well-known path", () => {
    expect(metadocPath("https://dp.example"))
        .toBe("https://dp.example/.well-known/oauth-authorization-server");
});

test("metadocPath: tolerates a trailing slash on iss", () => {
    expect(metadocPath("https://dp.example/"))
        .toBe("https://dp.example/.well-known/oauth-authorization-server");
});

test("sameOrigin: true only when scheme + host + port match", () => {
    expect(sameOrigin("https://dp.example/a", "https://dp.example/b")).toBe(true);
    expect(sameOrigin("https://dp.example", "http://dp.example")).toBe(false);   // scheme
    expect(sameOrigin("https://dp.example", "https://evil.example")).toBe(false); // host
    expect(sameOrigin("https://dp.example", "https://dp.example:8443")).toBe(false); // port
});

test("sameOrigin: fail-closed (false) on a malformed URL", () => {
    expect(sameOrigin("not-a-url", "https://dp.example")).toBe(false);
});
