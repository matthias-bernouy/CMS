import { describe, expect, test } from "bun:test";
import { resolveBody } from "cms-control/components/admin/Resources/Dashboards/runtime/expressions";

describe("dashboard runtime expressions", () => {
    test("resolves dotted action body paths into nested objects", () => {
        expect(resolveBody({
            displayName: "$field.displayName",
            "metadata.company": "$field.company",
            "metadata.employeeCount": "$field.employeeCount",
            "profile.locale": "fr-FR",
            missing: "$field.missing",
        }, {
            fields: {
                displayName: "Ada",
                company: "Bernouy",
                employeeCount: 12,
            },
        })).toEqual({
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
});
