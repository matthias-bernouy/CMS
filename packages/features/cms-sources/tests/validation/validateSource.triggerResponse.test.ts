import { describe, expect, test } from "bun:test";
import { validateSource } from "cms-sources/core/validation/validateSource";
import { ep, source } from "../helpers/sourceValidationFixtures";

describe("validateSource trigger-only projections", () => {
    test("bounds private projections to declared structured JSON responses", () => {
        const triggerBody = { type: "object" as const, properties: { token: { type: "string" as const } } };
        const valid = source({
            endpoints: [
                {
                    ...ep("urn:shop:private"),
                    output: [
                        {
                            status: "200",
                            body: { type: "object", properties: { id: { type: "string" } } },
                            triggerBody,
                        },
                    ],
                },
            ],
        });
        expect(validateSource(valid)).toEqual([]);

        const missingPublicBody = validateSource(
            source({
                endpoints: [{ ...ep("urn:shop:missingPublicBody"), output: [{ status: "200", triggerBody }] }],
            }),
        );
        expect(missingPublicBody.some((error) => error.includes("requires a public JSON body"))).toBe(true);

        const fileResponse = validateSource(
            source({
                endpoints: [
                    {
                        ...ep("urn:shop:filePrivate"),
                        responseKind: "file",
                        output: [
                            {
                                status: "200",
                                body: { type: "object", properties: { id: { type: "string" } } },
                                triggerBody,
                            },
                        ],
                    },
                ],
            }),
        );
        expect(fileResponse.some((error) => error.includes("not supported for file endpoint"))).toBe(true);

        const unsafeShapes = validateSource(
            source({
                endpoints: [
                    {
                        ...ep("urn:shop:unsafePrivate"),
                        output: [
                            {
                                status: "200",
                                body: { type: "object" },
                                triggerBody: { type: "object", properties: { envelope: { type: "object" } } },
                            },
                        ],
                    },
                ],
            }),
        );
        expect(unsafeShapes.some((error) => error.includes("public response body must be a structured"))).toBe(true);
        expect(unsafeShapes.some((error) => error.includes("only structured object fields"))).toBe(true);

        const opaqueArray = validateSource(
            source({
                endpoints: [
                    {
                        ...ep("urn:shop:opaqueArray"),
                        output: [
                            {
                                status: "200",
                                body: { type: "object", properties: { id: { type: "string" } } },
                                triggerBody: { type: "object", properties: { values: { type: "array" } } },
                            },
                        ],
                    },
                ],
            }),
        );
        expect(opaqueArray.some((error) => error.includes("only structured object fields"))).toBe(true);

        const overlap = validateSource(
            source({
                endpoints: [
                    {
                        ...ep("urn:shop:overlappingPrivate"),
                        output: [
                            {
                                status: "200",
                                body: { type: "object", properties: { id: { type: "string" } } },
                                triggerBody: { type: "object", properties: { id: { type: "string" } } },
                            },
                        ],
                    },
                ],
            }),
        );
        expect(overlap.some((error) => error.includes("duplicates public field"))).toBe(true);
    });
});
