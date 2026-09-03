import { describe, expect, test } from "bun:test";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "../../src/sdk/upgrade-fixtures-v1";

describe("upgrade fixture author SDK", () => {
    test("preserves a typed state between the two required hooks", async () => {
        const scenario = defineUpgradeScenario({
            name: "preserves an order",
            from: ">=1.0.0 <2.0.0",
            dependencies: [{ kind: "commerce", versionRange: "^1.0.0" }],
            seedBeforeUpgrade: async () => ({ orderId: "order-42" }),
            assertAfterUpgrade: async (_context, state) => {
                expect(state.orderId).toBe("order-42");
            },
        });
        const suite = defineUpgradeScenarios({ schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1, scenarios: [scenario] });

        expect(suite.scenarios).toHaveLength(1);
        await scenario.assertAfterUpgrade({} as never, await scenario.seedBeforeUpgrade({} as never));
        expect(Object.isFrozen(suite.scenarios)).toBeTrue();
        expect(Object.isFrozen(suite.scenarios[0])).toBeTrue();
    });

    test("rejects unknown lifecycle fields and unsupported ranges", () => {
        expect(() =>
            defineUpgradeScenario({
                name: "too open",
                from: "*",
                seedBeforeUpgrade: () => null,
                assertAfterUpgrade: () => undefined,
                probeAnything: () => undefined,
            } as never),
        ).toThrow(/unsupported field/u);
        expect(() =>
            defineUpgradeScenario({
                name: "invalid range",
                from: "latest",
                seedBeforeUpgrade: () => null,
                assertAfterUpgrade: () => undefined,
            }),
        ).toThrow(/supported SemVer range/u);
    });

    test("rejects duplicate names and unbounded dependency contracts", () => {
        const scenario = defineUpgradeScenario({
            name: "same",
            from: "^1.0.0",
            seedBeforeUpgrade: () => null,
            assertAfterUpgrade: () => undefined,
        });
        expect(() =>
            defineUpgradeScenarios({ schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1, scenarios: [scenario, scenario] }),
        ).toThrow(/names must be unique/u);
        expect(() =>
            defineUpgradeScenario({
                ...scenario,
                name: "bad dependency",
                dependencies: [{ kind: "commerce", versionRange: "*" }],
            }),
        ).toThrow(/versionRange/u);
    });

    test("rejects unknown suite fields and malformed dependencies", () => {
        const scenario = {
            name: "strict contract",
            from: "^1.0.0",
            seedBeforeUpgrade: () => null,
            assertAfterUpgrade: () => undefined,
        };
        expect(() =>
            defineUpgradeScenarios({
                schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
                scenarios: [scenario],
                probeAnything: true,
            } as never),
        ).toThrow(/unsupported field/u);
        expect(() => defineUpgradeScenario({ ...scenario, dependencies: [null] } as never)).toThrow(
            /must be an object/u,
        );
        expect(() =>
            defineUpgradeScenario({
                ...scenario,
                dependencies: [{ kind: "commerce" }, { kind: "commerce", versionRange: "^1.0.0" }],
            }),
        ).toThrow(/kinds must be unique/u);
    });
});
