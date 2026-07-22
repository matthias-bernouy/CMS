import { afterEach, describe, expect, test } from "bun:test";
import { resolveBody, valueAt } from "cms-control/components/admin/Resources/Dashboards/runtime/expressions";

afterEach(() => delete (Object.prototype as Record<string, unknown>).dashboardPolluted);

describe("dashboard runtime expressions", () => {
    test("resolves dotted action body paths into nested objects", () => {
        expect(
            resolveBody(
                {
                    displayName: "$field.displayName",
                    "metadata.company": "$field.company",
                    "metadata.employeeCount": "$field.employeeCount",
                    "profile.locale": "fr-FR",
                    missing: "$field.missing",
                },
                {
                    fields: {
                        displayName: "Ada",
                        company: "Bernouy",
                        employeeCount: 12,
                    },
                },
            ),
        ).toEqual({
            displayName: "Ada",
            metadata: {
                company: "Bernouy",
                employeeCount: 12,
            },
            profile: {
                locale: "fr-FR",
            },
        });
    });

    test("does not read or write through prototype path segments", () => {
        const prototype = Object.prototype as Record<string, unknown>;
        delete prototype.dashboardPolluted;

        expect(() =>
            resolveBody(
                {
                    "safe.value": "kept",
                    "__proto__.dashboardPolluted": "blocked",
                },
                {},
            ),
        ).toThrow('Unsafe dashboard body path "__proto__.dashboardPolluted"');

        expect(prototype.dashboardPolluted).toBeUndefined();
        expect(valueAt({}, "__proto__.dashboardPolluted")).toBeUndefined();
        expect(valueAt({}, "toString")).toBeUndefined();
    });
});
