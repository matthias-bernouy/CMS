import { describe, test, expect } from "bun:test";
import { parseSourceDto } from "cms-control/core/validation/gateway/parseSourceDto";
import { sourceDtoToSource } from "@bernouy/cms-sources";

/** A valid single-endpoint body, as an admin form posts it (flat keys). */
const validBody = (over: Record<string, unknown> = {}) => ({
    id: "shop",
    "meta.name": "Shop",
    "endpoints.0.endpointId": "getCart",
    "endpoints.0.method": "GET",
    "endpoints.0.targetUrl": "https://api.shop.com/cart",
    ...over,
});

describe("parseSourceDto", () => {
    const headers = (value: unknown) =>
        parseSourceDto(validBody({ "endpoints.0.headers": JSON.stringify(value) })).endpoints[0]!.headers;

    test("headers: a static header round-trips", () => {
        expect(headers([{ name: "X-Api-Version", source: { from: "static", value: "2024-01" } }])).toEqual([
            { name: "X-Api-Version", source: { from: "static", value: "2024-01" } },
        ] as any);
    });

    test("headers: a secret header round-trips ({from:'secret',ref})", () => {
        expect(headers([{ name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } }])).toEqual([
            { name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } },
        ] as any);
    });

    test("headers: a secret header prefix round-trips", () => {
        expect(
            headers([{ name: "Authorization", source: { from: "secret", ref: "${SUPABASE_KEY}", prefix: "Bearer " } }]),
        ).toEqual([
            { name: "Authorization", source: { from: "secret", ref: "${SUPABASE_KEY}", prefix: "Bearer " } },
        ] as any);
    });

    test("headers: a computed userID header round-trips", () => {
        expect(headers([{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }])).toEqual([
            { name: "X-User-ID", source: { from: "computed", ref: "userID" } },
        ] as any);
    });

    test("headers: an unknown computed ref is dropped", () => {
        expect(headers([{ name: "X-User-Email", source: { from: "computed", ref: "email" } }])).toBeUndefined();
    });

    test("headers: invalid names (space / non-ASCII / control / 'X:Y') are dropped", () => {
        const bad = [
            { name: "X Api", source: { from: "static", value: "v" } },
            { name: "X-Héader", source: { from: "static", value: "v" } },
            { name: "X\tApi", source: { from: "static", value: "v" } },
            { name: "X:Y", source: { from: "static", value: "v" } },
            { name: "X-Good", source: { from: "static", value: "v" } },
        ];
        expect(headers(bad)).toEqual([{ name: "X-Good", source: { from: "static", value: "v" } }] as any);
    });

    test("headers: forbidden names (host / cookie / connection) are dropped", () => {
        const bad = [
            { name: "Host", source: { from: "static", value: "x" } },
            { name: "cookie", source: { from: "static", value: "x" } },
            { name: "Connection", source: { from: "static", value: "x" } },
            { name: "X-Ok", source: { from: "static", value: "x" } },
        ];
        expect(headers(bad)).toEqual([{ name: "X-Ok", source: { from: "static", value: "x" } }] as any);
    });

    test("headers: a static value with CR / LF / NUL or other control char is dropped (Headers.set would throw)", () => {
        expect(headers([{ name: "X-Bad", source: { from: "static", value: "a\r\nInjected: 1" } }])).toBeUndefined();
        expect(headers([{ name: "X-Bad", source: { from: "static", value: "a\nb" } }])).toBeUndefined();
        expect(headers([{ name: "X-Bad", source: { from: "static", value: "a\u0000b" } }])).toBeUndefined(); // NUL
        expect(headers([{ name: "X-Bad", source: { from: "static", value: "a\u0007b" } }])).toBeUndefined(); // BEL control
        // a TAB is legal in a header value -> kept
        expect(headers([{ name: "X-Ok", source: { from: "static", value: "a\tb" } }])).toHaveLength(1);
    });

    test("headers: a static value over 8192 chars is dropped", () => {
        expect(headers([{ name: "X-Big", source: { from: "static", value: "a".repeat(8193) } }])).toBeUndefined();
        const ok = headers([{ name: "X-Big", source: { from: "static", value: "a".repeat(8192) } }]);
        expect(ok).toHaveLength(1);
    });

    test("headers: more than 50 entries are capped at 50", () => {
        const many = Array.from({ length: 60 }, (_v, i) => ({
            name: `X-H-${i}`,
            source: { from: "static", value: "v" },
        }));
        expect(headers(many)).toHaveLength(50);
    });

    test("headers: duplicate names are deduped case-insensitive, keep-first", () => {
        const dup = [
            { name: "X-Api", source: { from: "static", value: "first" } },
            { name: "x-api", source: { from: "static", value: "second" } },
        ];
        expect(headers(dup)).toEqual([{ name: "X-Api", source: { from: "static", value: "first" } }] as any);
    });

    test("headers: malformed source / empty / non-array → undefined", () => {
        expect(headers([{ name: "X-A", source: { from: "static" } }])).toBeUndefined(); // no value
        expect(headers([{ name: "X-A", source: { from: "secret", ref: "" } }])).toBeUndefined(); // empty ref
        expect(headers([{ name: "X-A", source: { from: "weird" } }])).toBeUndefined(); // unknown from
        expect(headers([{ name: "X-A" }])).toBeUndefined(); // no source
        expect(headers([])).toBeUndefined();
        expect(parseSourceDto(validBody({ "endpoints.0.headers": "{bad" })).endpoints[0]!.headers).toBeUndefined();
        expect(parseSourceDto(validBody({ "endpoints.0.headers": "" })).endpoints[0]!.headers).toBeUndefined();
    });

    test("headers: full round-trip parse → toProvider sets endpoint.headers; never sets rules", () => {
        const h = [{ name: "X-Api-Version", source: { from: "static", value: "2024-01" } }];
        const dto = parseSourceDto(validBody({ "endpoints.0.headers": JSON.stringify(h) }));
        const provider = sourceDtoToSource(dto);
        expect(provider.endpoints[0]!.headers).toEqual(h as any);
        expect((provider.endpoints[0] as any).rules).toBeUndefined();
    });

    test("round-trips endpoint schema invalidation effects through the source DTO", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.effects": JSON.stringify({ invalidatesSchema: true }) }));
        const provider = sourceDtoToSource(dto);
        expect(provider.endpoints[0]!.effects).toEqual({ invalidatesSchema: true });
    });
});
