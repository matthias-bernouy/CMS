import { describe, expect, test } from "bun:test";
import { isReservedSourceParamName, validateSource } from "@bernouy/cms-sources";
import { ep, source } from "../helpers/sourceValidationFixtures";

describe("reserved CMS Source parameters", () => {
    test.each(["cms-width", "CMS-WIDTH", " cms-preset ", "Cms-future"])(
        "recognizes %s case-insensitively after trimming",
        (name) => {
            expect(isReservedSourceParamName(name)).toBe(true);
        },
    );

    test.each(["width", "x-cms-width", "cms", "cms_width"])("does not reserve %s", (name) => {
        expect(isReservedSourceParamName(name)).toBe(false);
    });

    test.each(["query", "path", "header"] as const)("rejects the namespace in %s params", (location) => {
        const candidate = source({
            endpoints: [
                {
                    ...ep("urn:shop:image"),
                    input: {
                        params: [
                            {
                                name: " CMS-WIDTH ",
                                in: location,
                                schema: { type: "string" },
                            },
                        ],
                    },
                },
            ],
        });
        expect(validateSource(candidate)).toContain('reserved CMS param for "urn:shop:image": " CMS-WIDTH "');
    });
});
