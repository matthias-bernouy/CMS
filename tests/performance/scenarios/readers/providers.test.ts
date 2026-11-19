import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { ClientFailure } from "../../harness/clients/failure";
import { prepareProviderReader } from "./providers";

async function fixture() {
    const f = await inventoryFixture();
    const record = {
        id: "installation-owned",
        providerId: "performance/provider",
        accountId: "account-owned",
        endpoint: "http://localhost:5103",
        status: "enabled",
        manifestVersion: "1.0.0",
        revision: 1,
    };
    const selections = [
        {
            contractId: "ulvia/cms.content",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
            installationId: record.id,
        },
    ];
    const calls: string[] = [];
    const output = () => ({
        ...record,
        selections: structuredClone(selections),
        contracts: selections.map(({ contractId, version, digest }) => ({
            contractId,
            version,
            digest,
            status: "ready",
        })),
    });
    const context: Parameters<typeof prepareProviderReader>[0] = {
        async provider() {
            calls.push("list-provider-installations");
            return { entry: structuredClone(record), selections: structuredClone(selections) };
        },
        async call(capability, _binding, _input, assert = () => {}) {
            calls.push(capability);
            const value = output();
            try {
                await assert(value);
                return { observation: f.measurement, output: value };
            } catch (error) {
                if (!(error instanceof ClientFailure)) {
                    throw error;
                }
                return {
                    observation: { ...f.measurement, validated: false, completed: false, failure: error.code },
                    output: value,
                };
            }
        },
        checked: async () => output(),
        refused: async () => {},
    };
    return { record, selections, calls, context };
}

test("cold installation reader refreshes only its exact observation revision through a different capability", async () => {
    const f = await fixture();
    const sample = await prepareProviderReader(f.context, "get-provider-installation", "http", "cold");
    f.record.revision = 2;
    await sample.beforeMeasure!();
    expect(f.calls).toEqual(["list-provider-installations", "list-provider-installations"]);
    const result = await sample.send();
    expect(result.validated && result.completed).toBe(true);
    await sample.verify!();
    expect(f.calls).toEqual([
        "list-provider-installations",
        "list-provider-installations",
        "get-provider-installation",
    ]);
});

test("post-restart calibration rejects identity, manifest, status, selection or revision corruption", async () => {
    for (const field of ["id", "providerId", "accountId", "endpoint", "status", "manifestVersion"] as const) {
        const f = await fixture();
        const sample = await prepareProviderReader(f.context, "get-provider-installation", "http", "cold");
        f.record[field] = "changed";
        await expect(sample.beforeMeasure!()).rejects.toThrow("provider-reader-cold-identity");
        expect(f.calls).not.toContain("get-provider-installation");
    }
    const f = await fixture();
    const sample = await prepareProviderReader(f.context, "get-provider-installation", "http", "cold");
    f.selections[0]!.digest = `sha256:${"b".repeat(64)}`;
    await expect(sample.beforeMeasure!()).rejects.toThrow("provider-reader-cold-selections");
    for (const revision of [0, 1.5, Infinity]) {
        const f = await fixture();
        const sample = await prepareProviderReader(f.context, "get-provider-installation", "http", "cold");
        f.record.revision = revision;
        await expect(sample.beforeMeasure!()).rejects.toThrow("provider-reader-cold-revision");
    }
});

test("measured response still requires the exact refreshed revision and unchanged selected contracts", async () => {
    const f = await fixture();
    const sample = await prepareProviderReader(f.context, "get-provider-installation", "http", "cold");
    f.record.revision = 2;
    await sample.beforeMeasure!();
    f.record.revision = 3;
    const result = await sample.send();
    expect(result.validated).toBe(false);
    expect(result.failure).toBe("provider-reader-observation-revision");
    expect(f.calls.filter((name) => name === "get-provider-installation")).toHaveLength(1);
});

test("non-cold readers retain their existing exact-revision expectation", async () => {
    const f = await fixture();
    const sample = await prepareProviderReader(f.context, "get-provider-installation", "http");
    expect(sample.beforeMeasure).toBeUndefined();
    f.record.revision = 2;
    expect((await sample.send()).validated).toBe(false);
    const access = await prepareProviderReader(f.context, "get-provider-access", "http", "cold");
    expect(access.beforeMeasure).toBeUndefined();
});
