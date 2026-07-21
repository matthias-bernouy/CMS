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
    test("multi-row body → endpoints in order", () => {
        const dto = parseSourceDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://api.shop.com/cart",
            "endpoints.1.endpointId": "addItem",
            "endpoints.1.method": "POST",
            "endpoints.1.targetUrl": "https://api.shop.com/items",
        });
        expect(dto.endpoints).toHaveLength(2);
        expect(dto.endpoints.map((e) => e.endpointId)).toEqual(["getCart", "addItem"]);
        expect(dto.endpoints[1]!.method).toBe("POST");
    });

    test("single-row body → 1 endpoint", () => {
        expect(parseSourceDto(validBody()).endpoints).toHaveLength(1);
        expect(parseSourceDto(validBody()).endpoints[0]!.params).toEqual([]); // no params declared
    });

    test("round-trips a bounded endpoint timeout override", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.timeoutMs": "60000" }));
        expect(dto.endpoints[0]!.timeoutMs).toBe(60_000);
        expect(sourceDtoToSource(dto).endpoints[0]!.timeoutMs).toBe(60_000);

        for (const timeoutMs of ["0", "1.5", "120001"]) {
            expect(() => parseSourceDto(validBody({ "endpoints.0.timeoutMs": timeoutMs }))).toThrow(
                /timeoutMs.*integer between 1 and 120000/,
            );
        }
    });

    test("params JSON blob → endpoint.params", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.params": JSON.stringify([
                    { name: "limit", in: "query", type: "number", required: true },
                    { name: "q", in: "query", type: "string", required: false },
                ]),
            }),
        );
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "limit", in: "query", type: "number", required: true },
            { name: "q", in: "query", type: "string", required: false },
        ]);
    });

    test("params JSON blob preserves computed userID source", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.params": JSON.stringify([
                    {
                        name: "user_id",
                        in: "query",
                        type: "string",
                        required: true,
                        source: { from: "computed", ref: "userID" },
                    },
                ]),
            }),
        );
        expect(dto.endpoints[0]!.params).toEqual([
            {
                name: "user_id",
                in: "query",
                type: "string",
                required: true,
                source: { from: "computed", ref: "userID" },
            },
        ]);
    });

    test("params JSON blob preserves computed userRole source", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.params": JSON.stringify([
                    {
                        name: "operator_role",
                        in: "query",
                        type: "string",
                        required: true,
                        source: { from: "computed", ref: "userRole" },
                    },
                ]),
            }),
        );
        expect(dto.endpoints[0]!.params).toEqual([
            {
                name: "operator_role",
                in: "query",
                type: "string",
                required: true,
                source: { from: "computed", ref: "userRole" },
            },
        ]);
    });

    test("params JSON blob rejects unknown computed refs", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([
                        { name: "email", in: "query", type: "string", source: { from: "computed", ref: "email" } },
                    ]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.source\.ref/);
    });

    test("a blank-name param entry is skipped (unfilled)", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.params": JSON.stringify([
                    { name: "", in: "query", type: "string" },
                    { name: "q", in: "query", type: "string" },
                ]),
            }),
        );
        expect(dto.endpoints[0]!.params.map((p) => p.name)).toEqual(["q"]);
    });

    test("malformed / non-array params blob → InvalidParam", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.params": "{not json" }))).toThrow(/endpoints\.0\.params/);
        expect(() => parseSourceDto(validBody({ "endpoints.0.params": JSON.stringify({ name: "x" }) }))).toThrow(
            /endpoints\.0\.params/,
        );
    });

    test("path params derived from URL {placeholders} (required, in:path)", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/items/{id}" }));
        expect(dto.endpoints[0]!.params).toEqual([{ name: "id", in: "path", type: "string", required: true }]);
    });

    test("multiple path params kept in URL order", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{org}/items/{id}" }));
        expect(dto.endpoints[0]!.params.map((p) => p.name)).toEqual(["org", "id"]);
        expect(dto.endpoints[0]!.params.every((p) => p.in === "path" && p.required)).toBe(true);
    });

    test("a repeated placeholder is deduped", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{id}/sub/{id}" }));
        expect(dto.endpoints[0]!.params.map((p) => p.name)).toEqual(["id"]);
    });

    test("path params precede blob params in the merged list", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
                "endpoints.0.params": JSON.stringify([{ name: "limit", in: "query", type: "number" }]),
            }),
        );
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "id", in: "path", type: "string", required: true },
            { name: "limit", in: "query", type: "number", required: false },
        ]);
    });

    test("a blob param shadowing a path placeholder → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
                    "endpoints.0.params": JSON.stringify([{ name: "id", in: "query", type: "string" }]),
                }),
            ),
        ).toThrow(/duplicate param name/);
    });

    test("bad param type → InvalidParam (scoped to the array index)", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "query", type: "object" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.type/);
    });

    test("`in:'path'` from the blob → InvalidParam (path is URL-derived, never posted)", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "path", type: "string" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.in/);
    });

    test("unknown param `in` → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "body", type: "string" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.in/);
    });

    test("duplicate param name in the blob → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([
                        { name: "x", in: "query", type: "string" },
                        { name: "x", in: "query", type: "number" },
                    ]),
                }),
            ),
        ).toThrow(/duplicate param name/);
    });

    test("gap compaction — a removed row (missing index) is skipped, result is dense", () => {
        const dto = parseSourceDto({
            id: "shop",
            "endpoints.0.endpointId": "a",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://x.com",
            "endpoints.2.endpointId": "b",
            "endpoints.2.method": "GET",
            "endpoints.2.targetUrl": "https://y.com",
        });
        expect(dto.endpoints).toHaveLength(2);
        expect(dto.endpoints.map((e) => e.endpointId)).toEqual(["a", "b"]);
    });

    test("missing id → MissingParam", () => {
        expect(() => parseSourceDto(validBody({ id: undefined }))).toThrow(/Missing param id/);
    });

    test("punctuation-only id (slugifies to empty) → InvalidParam", () => {
        expect(() => parseSourceDto(validBody({ id: "!!!" }))).toThrow(/Invalid param id/);
    });

    test("missing endpoint sub-field (key absent) → MissingParam scoped to the row", () => {
        expect(() =>
            parseSourceDto({
                id: "shop",
                "endpoints.0.endpointId": "getCart",
                "endpoints.0.method": "GET",
                // targetUrl omitted entirely, as a form would when the input is absent
            }),
        ).toThrow(/Missing param endpoints\.0\.targetUrl/);
    });

    test("empty-string endpoint sub-field → MissingParam (empty input counts as missing)", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.targetUrl": "" }))).toThrow(
            /Missing param endpoints\.0\.targetUrl/,
        );
    });

    test("bad method → InvalidParam scoped to the row", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.method": "FETCH" }))).toThrow(
            /Invalid param endpoints\.0\.method/,
        );
    });

    test("bad targetUrl → InvalidParam scoped to the row", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.targetUrl": "not a url" }))).toThrow(
            /Invalid param endpoints\.0\.targetUrl/,
        );
    });

    test("round-trips endpoint access mode", () => {
        const access = { mode: "admin" as const };
        const dto = parseSourceDto(validBody({ "endpoints.0.access": JSON.stringify(access) }));
        expect(dto.endpoints[0]!.access).toEqual(access);
        expect(sourceDtoToSource(dto).endpoints[0]!.access).toEqual(access);
    });

    test("rejects role-specific endpoint access", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.access": JSON.stringify({ mode: "admin", roles: ["custom"] }),
                }),
            ),
        ).toThrow(/no longer supported/);
    });

    test("duplicate endpointId across rows → InvalidParam", () => {
        expect(() =>
            parseSourceDto({
                id: "shop",
                "endpoints.0.endpointId": "dup",
                "endpoints.0.method": "GET",
                "endpoints.0.targetUrl": "https://x.com",
                "endpoints.1.endpointId": "dup",
                "endpoints.1.method": "GET",
                "endpoints.1.targetUrl": "https://y.com",
            }),
        ).toThrow(/duplicate within provider/);
    });

    test("zero endpoints → allowed (provider shell; endpoints added on the edit page)", () => {
        const dto = parseSourceDto({ id: "shop", "meta.name": "Shop" });
        expect(dto.endpoints).toEqual([]);
        expect(dto.id).toBe("shop");
    });

    test("provider meta.icon round-trips when the form posts it (B1)", () => {
        const dto = parseSourceDto(validBody({ "meta.icon": "map-pin" }));
        expect(dto.meta).toEqual({ name: "Shop", icon: "map-pin" } as any);
    });

    test("provider meta.svg round-trips when the form posts it", () => {
        const dto = parseSourceDto(validBody({ "meta.svg": '<svg viewBox="0 0 24 24"></svg>' }));
        expect(dto.meta).toEqual({ name: "Shop", svg: '<svg viewBox="0 0 24 24"></svg>' } as any);
    });

    test("blank meta.icon → no icon (provider had none)", () => {
        const dto = parseSourceDto(validBody({ "meta.icon": "" }));
        expect(dto.meta.icon).toBeUndefined();
    });

    test("meta.name defaults to the id when absent", () => {
        const dto = parseSourceDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://x.com",
        });
        expect(dto.meta.name).toBe("shop");
    });

    test("client-supplied endpoint urn is ignored (recomputed by the service)", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.urn": "urn:evil:inject" })) as any;
        expect(dto.endpoints[0].urn).toBeUndefined();
        expect(dto.endpoints[0].endpointId).toBe("getCart");
    });

    test("body JSON blob → parsed DataShape on the DTO", () => {
        const body = { type: "object", properties: { id: { type: "string" } } };
        const dto = parseSourceDto(validBody({ "endpoints.0.body": JSON.stringify(body) }));
        expect(dto.endpoints[0]!.body).toEqual(body as any);
    });

    test("output JSON blob → parsed per-status list on the DTO (round-trip)", () => {
        const body = { type: "array", items: { type: "number" } };
        const output = [{ status: "200", body }];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual(output as any);
    });

    test("output JSON blob preserves server-only trigger response fields", () => {
        const output = [
            {
                status: "201",
                body: { type: "object", properties: { id: { type: "number" } } },
                triggerBody: {
                    type: "object",
                    properties: {
                        authorization: { type: "string" },
                        actorId: { type: "string", semantic: { kind: "user-id" } },
                    },
                    required: ["authorization", "actorId"],
                },
            },
        ];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));

        expect(dto.endpoints[0]!.output).toEqual(output as any);
        expect(sourceDtoToSource(dto).endpoints[0]!.output?.[0]?.triggerBody).toEqual({
            ...output[0]!.triggerBody,
            properties: {
                authorization: { type: "string" },
                actorId: {
                    type: "string",
                    semantic: { kind: "user-id", authority: "shop" },
                },
            },
        } as any);
    });

    test("blank body field → no body on the DTO", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.body": "" }));
        expect(dto.endpoints[0]!.body).toBeUndefined();
    });

    test("malformed body JSON → InvalidParam scoped to the endpoint", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.body": "{bad" }))).toThrow(/endpoints\.0\.body/);
    });

    test("body shape with a bad node type → InvalidParam", () => {
        const bad = JSON.stringify({ type: "object", properties: { x: { type: "datetime" } } });
        expect(() => parseSourceDto(validBody({ "endpoints.0.body": bad }))).toThrow(
            /endpoints\.0\.body\.properties\.x\.type/,
        );
    });

    // ── Response list (`output`) — lenient, per-status, never throws ──
    test('output: valid statuses (incl. "default") are kept, each with its body', () => {
        const output = [
            { status: "200", body: { type: "object", properties: { ok: { type: "boolean" } } } },
            { status: "404", body: { type: "object" } },
            { status: "default", body: { type: "string" } },
        ];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual(output as any);
    });

    test("output: invalid statuses are dropped, valid ones survive", () => {
        const output = [
            { status: "abc", body: { type: "string" } }, // not a code
            { status: "099", body: { type: "string" } }, // < 100
            { status: "600", body: { type: "string" } }, // > 599
            { status: 200, body: { type: "string" } }, // number, not string
            { status: "201", body: { type: "string" } }, // valid → kept
        ];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual([{ status: "201", body: { type: "string" } }] as any);
    });

    test("output: duplicate status keeps the FIRST occurrence", () => {
        const output = [
            { status: "200", body: { type: "string" } },
            { status: "200", body: { type: "number" } },
        ];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual([{ status: "200", body: { type: "string" } }] as any);
    });

    test("output: a body-less entry (e.g. 204) is preserved as {status}", () => {
        const output = [{ status: "204" }, { status: "200", body: { type: "object" } }];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual([
            { status: "204" },
            { status: "200", body: { type: "object" } },
        ] as any);
    });

    test("output: a bad body is dropped but the status-only entry is KEPT", () => {
        const output = [{ status: "200", body: { type: "datetime" } }]; // off-vocabulary node type
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        expect(dto.endpoints[0]!.output).toEqual([{ status: "200" }] as any);
    });

    test("output: malformed JSON / non-array → undefined (no crash, no output stored)", () => {
        expect(parseSourceDto(validBody({ "endpoints.0.output": "{bad" })).endpoints[0]!.output).toBeUndefined();
        expect(
            parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify({ status: "200" }) })).endpoints[0]!.output,
        ).toBeUndefined();
        expect(parseSourceDto(validBody({ "endpoints.0.output": "[]" })).endpoints[0]!.output).toBeUndefined();
        expect(parseSourceDto(validBody({ "endpoints.0.output": "" })).endpoints[0]!.output).toBeUndefined();
    });

    test("output: full round-trip parse → toProvider preserves the list", () => {
        const output = [
            { status: "200", body: { type: "object", properties: { id: { type: "string" } } } },
            { status: "404" },
        ];
        const dto = parseSourceDto(validBody({ "endpoints.0.output": JSON.stringify(output) }));
        const provider = sourceDtoToSource(dto);
        expect(provider.endpoints[0]!.output).toEqual(output as any);
    });

    // ── Request headers (`headers`) — lenient, drop-don't-throw ──
    const headers = (h: unknown) =>
        parseSourceDto(validBody({ "endpoints.0.headers": JSON.stringify(h) })).endpoints[0]!.headers;

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
