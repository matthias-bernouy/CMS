import { describe, expect, test } from "bun:test";
import {
    assertIntegrationVersionInstallable,
    assertUpgradeEligible,
    type IntegrationDefinitionIndex,
} from "@bernouy/cms-integrations";

const INDEX: IntegrationDefinitionIndex = {
    kind: "commerce",
    label: "Commerce",
    versions: [
        { version: "1.0.0", path: "versions/1.0.0", definition: "integration.json" },
        {
            version: "1.1.0",
            path: "versions/1.1.0",
            definition: "integration.json",
            status: "blocked",
        },
        {
            version: "1.2.0",
            path: "versions/1.2.0",
            definition: "integration.json",
            status: "inadmissible",
        },
        {
            version: "1.3.0",
            path: "versions/1.3.0",
            definition: "integration.json",
            status: "unverified",
        },
    ],
};

describe("integration version eligibility", () => {
    test("returns an exact installable entry", () => {
        expect(assertIntegrationVersionInstallable(INDEX, "1.0.0").version).toBe("1.0.0");
        expect(assertUpgradeEligible(INDEX, "1.0.0").version).toBe("1.0.0");
    });

    test.each([
        ["1.1.0", "blocked"],
        ["1.2.0", "inadmissible"],
        ["1.3.0", "unverified"],
    ] as const)("rejects %s because it is %s", (version, status) => {
        expect(() => assertUpgradeEligible(INDEX, version)).toThrow(
            `integration version "commerce@${version}" is ${status}`,
        );
    });

    test("rejects an unknown exact version", () => {
        expect(() => assertUpgradeEligible(INDEX, "2.0.0")).toThrow('unknown integration version "commerce@2.0.0"');
    });
});
