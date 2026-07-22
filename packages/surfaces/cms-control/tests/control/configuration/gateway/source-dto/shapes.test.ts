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
});
