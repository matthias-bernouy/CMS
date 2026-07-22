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
});
