import { expect, test } from "bun:test";
import {
    requestContext,
    encodeRequestContext,
    decodeRequestContext,
    snapshotRequestContext,
} from "@bernouy/cms-gateway/protocol";
import { snapshotInvocation } from "cms-gateway/invocation/core/snapshotInvocation";

test("browser request metadata preserves standard headers and excludes credentials and connection state", () => {
    const request = new Request("https://site.test/page?q=1", {
        headers: {
            "accept-language": "fr-FR, en;q=0.8",
            "if-none-match": 'W/"v1"',
            range: "bytes=-12",
            cookie: "secret",
            authorization: "Bearer secret",
            "accept-encoding": "gzip",
            "x-private": "hidden",
            "x-ulvia-request-context": "forged",
        },
    });
    const context = requestContext(request, true);
    expect(context.headers).toEqual({
        "accept-language": "fr-FR, en;q=0.8",
        "if-none-match": 'W/"v1"',
        range: "bytes=-12",
    });
    expect(context.resource).toEqual({ url: request.url, method: "GET" });
    expect(decodeRequestContext(encodeRequestContext(context))).toEqual(context);
});
test("custom headers require explicit capture and cannot replace reserved metadata", () => {
    const request = new Request("https://site.test/", { headers: { "x-project": "demo" } });
    expect(requestContext(request).headers).toEqual({});
    expect(requestContext(request, false, ["x-project"]).headers).toEqual({ "x-project": "demo" });
    for (const name of ["authorization", "cookie", "x-ulvia-actor", "host", "content-length", "transfer-encoding"]) {
        expect(() => requestContext(request, false, [name])).toThrow();
        expect(() => snapshotRequestContext({ headers: { [name]: "forged" } })).toThrow();
    }
});
test("request metadata is independently snapshotted and bounded before gateway routing", () => {
    const headers = { "accept-language": "fr" };
    const invocation = snapshotInvocation({
        siteId: "default",
        contractId: "ulvia/catalog",
        capabilityId: "read",
        actor: { kind: "anonymous" },
        input: {},
        requestContext: { headers },
    });
    headers["accept-language"] = "en";
    expect(invocation.requestContext?.headers["accept-language"]).toBe("fr");
    expect(Object.isFrozen(invocation.requestContext?.headers)).toBe(true);
    for (const value of [
        { headers: { accept: "a\r\nb" } },
        { headers: { accept: "a".repeat(4097) } },
        { headers: {}, unknown: true },
    ]) {
        expect(() => snapshotRequestContext(value)).toThrow();
    }
    expect(() => decodeRequestContext("%broken")).toThrow();
    expect(() => decodeRequestContext(encodeURIComponent('{"version":1,"version":1,"headers":{}}'))).toThrow();
});

test("capturing a long public URL preserves the input budget and bounded representation context", () => {
    const request = new Request("https://site.test/page?q=" + "%C3%A9".repeat(2000), {
        headers: { "accept-language": "fr" },
    });
    const context = requestContext(request, true);
    expect(context.resource).toEqual({ method: "GET" });
    expect(decodeRequestContext(encodeRequestContext(context))).toEqual(context);
});
