import { describe, expect, test } from "bun:test";
import { parseIntegrationImportRequest } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations source DTO parsing", () => {
    test("rejects malformed manual source artifacts before import execution", () => {
        expect(() =>
            parseIntegrationImportRequest({
                definition: {
                    kind: "broken",
                    label: "Broken",
                    inputs: [],
                    artifacts: [{ type: "source", source: {} }],
                },
                answers: {},
            }),
        ).toThrow(/definition\.artifacts\.0\.source\.id/);
    });

    test("parses manual source svg metadata before import execution", () => {
        const request = parseIntegrationImportRequest({
            definition: {
                kind: "source-svg",
                label: "Source SVG",
                inputs: [],
                artifacts: [
                    {
                        type: "source",
                        source: {
                            id: "items",
                            meta: { name: "Items", icon: "database", svg: '<svg viewBox="0 0 24 24"></svg>' },
                            endpoints: [
                                {
                                    endpointId: "getImage",
                                    method: "GET",
                                    targetUrl: "https://api.example.com/images/{fileId}",
                                    timeoutMs: 60_000,
                                    responseKind: "file",
                                    mediaType: "image/*",
                                    params: [{ name: "fileId", in: "path", required: true, type: "string" }],
                                },
                            ],
                        },
                    },
                ],
            },
            answers: {},
        });

        expect(request.siteIntegrations[0]?.artifacts?.[0]).toEqual({
            type: "source",
            source: {
                id: "items",
                meta: { name: "Items", icon: "database", svg: '<svg viewBox="0 0 24 24"></svg>' },
                endpoints: [
                    {
                        endpointId: "getImage",
                        method: "GET",
                        targetUrl: "https://api.example.com/images/{fileId}",
                        timeoutMs: 60_000,
                        responseKind: "file",
                        mediaType: "image/*",
                        params: [{ name: "fileId", in: "path", required: true, type: "string" }],
                    },
                ],
            },
        });
    });

    test("rejects source endpoint timeout overrides outside the runtime bound", () => {
        expect(() =>
            parseIntegrationImportRequest({
                definition: {
                    kind: "source-timeout",
                    label: "Source timeout",
                    inputs: [],
                    artifacts: [
                        {
                            type: "source",
                            source: {
                                id: "items",
                                meta: { name: "Items" },
                                endpoints: [
                                    {
                                        endpointId: "list",
                                        method: "GET",
                                        targetUrl: "https://api.example.com/items",
                                        timeoutMs: 120_001,
                                        params: [],
                                    },
                                ],
                            },
                        },
                    ],
                },
                answers: {},
            }),
        ).toThrow(/timeoutMs.*integer between 1 and 120000/);
    });

    test("rejects malformed manual header artifacts before import execution", () => {
        expect(() =>
            parseIntegrationImportRequest({
                definition: {
                    kind: "bad-header",
                    label: "Bad Header",
                    inputs: [],
                    artifacts: [
                        {
                            type: "source",
                            source: {
                                id: "bad-header",
                                meta: { name: "Bad Header" },
                                endpoints: [
                                    {
                                        endpointId: "list",
                                        method: "GET",
                                        targetUrl: "https://api.example.com/items",
                                        params: [],
                                        headers: [{}],
                                    },
                                ],
                            },
                        },
                    ],
                },
                answers: {},
            }),
        ).toThrow(/definition\.artifacts\.0\.source\.endpoints\.0\.headers\.0\.name/);
    });
});
