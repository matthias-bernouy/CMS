import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonRequestInit, localServiceUrl } from "../../src/release/sandbox/scenario/fixture/http";
import { snapshotFixtureState } from "../../src/release/sandbox/scenario/fixture/state";
import { loadUpgradeFixtureSuite, upgradeFixturesForBaseline } from "../../src/release/verification/upgradeFixtures";
import { temporaryRoot } from "./support";

describe("integration-owned upgrade fixture loading", () => {
    test("treats the conventional module as optional", async () => {
        expect(await loadUpgradeFixtureSuite(await temporaryRoot())).toBeNull();
    });

    test("loads a bounded module and selects fixtures by immutable baseline", async () => {
        const root = await temporaryRoot();
        const directory = join(root, "tests", "integration-contracts");
        await mkdir(directory, { recursive: true });
        await writeFile(
            join(directory, "upgrade-fixtures.ts"),
            `export default {
                schema: "ulvia.upgrade-fixtures.v1",
                scenarios: [{
                    name: "legacy data",
                    from: ">=1.0.0 <2.0.0",
                    seedBeforeUpgrade: () => ({ id: "legacy" }),
                    assertAfterUpgrade: () => undefined,
                }],
            };`,
        );

        const suite = await loadUpgradeFixtureSuite(root);
        expect(suite?.scenarios).toHaveLength(1);
        expect(upgradeFixturesForBaseline(suite, "1.4.0")[0]?.name).toBe("legacy data");
        expect(() => upgradeFixturesForBaseline(suite, "2.0.0")).toThrow(/do not cover immutable baseline/u);
    });

    test("rejects extra lifecycle hooks instead of silently accepting them", async () => {
        const root = await temporaryRoot();
        const directory = join(root, "tests", "integration-contracts");
        await mkdir(directory, { recursive: true });
        await writeFile(
            join(directory, "upgrade-fixtures.ts"),
            `export default {
                schema: "ulvia.upgrade-fixtures.v1",
                scenarios: [{
                    name: "too open",
                    from: "^1.0.0",
                    seedBeforeUpgrade: () => null,
                    assertAfterUpgrade: () => undefined,
                    assertDuringAnything: () => undefined,
                }],
            };`,
        );

        await expect(loadUpgradeFixtureSuite(root)).rejects.toThrow(/Invalid upgrade fixture module/u);
    });

    test("keeps author HTTP requests inside the sandbox without protected headers", () => {
        expect(() => jsonRequestInit({ headers: { authorization: "secret" } })).toThrow(/protected HTTP header/u);
        expect(() => localServiceUrl("http://127.0.0.1:54321", "//outside.test/path")).toThrow(
            /isolated Supabase origin/u,
        );
        expect(localServiceUrl("http://127.0.0.1:54321", "/storage/v1/bucket").origin).toBe("http://127.0.0.1:54321");
    });

    test("snapshots only bounded I-JSON state between lifecycle hooks", () => {
        const original = { nested: { id: "fixture" } };
        const snapshot = snapshotFixtureState(original);
        expect(snapshot).toEqual(original);
        expect(snapshot).not.toBe(original);
        expect(() => snapshotFixtureState({ payload: "x".repeat(1_000_001) })).toThrow(/exceeds 1000000 bytes/u);
        expect(() => snapshotFixtureState({ unsupported: undefined })).toThrow(/unsupported type/u);
    });
});
