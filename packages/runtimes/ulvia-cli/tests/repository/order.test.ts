import { describe, expect, test } from "bun:test";
import { orderPushRecords } from "../../src/publication/order";
import type { LocalPackageRecord } from "../../src/repository/manifest";
import { integrationDefinition } from "../fixtures";

describe("push planning", () => {
    test("orders every version after its required local dependencies", () => {
        const records = [
            record("app", "1.0.0", [{ name: "core", kind: "core", versionRange: "^1.0.0" }]),
            record("core", "1.1.0"),
            record("independent", "2.0.0"),
            record("core", "1.0.0"),
        ];

        expect(orderPushRecords(records).map(coordinate)).toEqual([
            "core@1.0.0",
            "core@1.1.0",
            "app@1.0.0",
            "independent@2.0.0",
        ]);
    });

    test("rejects local dependency cycles before uploading", () => {
        const records = [
            record("alpha", "1.0.0", [{ name: "beta", kind: "beta" }]),
            record("beta", "1.0.0", [{ name: "alpha", kind: "alpha" }]),
        ];

        expect(() => orderPushRecords(records)).toThrow(/dependency cycle/);
    });
});

function record(
    kind: string,
    version: string,
    dependencies: readonly { name: string; kind: string; versionRange?: string }[] = [],
): LocalPackageRecord {
    return {
        kind,
        version,
        digest: "a".repeat(64),
        verificationDigest: "b".repeat(64),
        source: `local:/${kind}`,
        pulledAt: "2026-01-01T00:00:00.000Z",
        definition: integrationDefinition(kind, version, dependencies.length ? { dependencies } : {}),
    } as LocalPackageRecord;
}

function coordinate(record: LocalPackageRecord): string {
    return `${record.kind}@${record.version}`;
}
