import { expect, test } from "bun:test";
import { migrateConfiguration } from "cms-repository/collections/installations/migrations/transforms/siteData";

test("prunes empty parents after moving a configuration value", () => {
    expect(
        migrateConfiguration({ layout: { density: "compact" } }, [
            { kind: "move-configuration-value", from: ["layout", "density"], to: ["display", "density"] },
        ]),
    ).toEqual({ display: { density: "compact" } });
});

test("keeps non-empty parents after removing a configuration value", () => {
    expect(
        migrateConfiguration({ layout: { density: "compact", columns: 3 } }, [
            { kind: "remove-configuration-value", path: ["layout", "density"] },
        ]),
    ).toEqual({ layout: { columns: 3 } });
});
