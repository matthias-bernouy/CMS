import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { validateCapabilityUsage } from "@bernouy/repository/providers/selections";
import { DENIED_READ } from "./context";
import type { CapabilityUsageEvidence } from "@bernouy/repository/providers/selections";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";

test("upgrade grant fixtures preserve required diagnostic consumers with real official contract definitions", async () => {
    const build = await compileOfficialFeatures();
    const releases = new InMemoryReleaseCatalogue();
    for (const admitted of build.contracts) {
        await releases.publish(admitted);
    }
    const selections: ContractSelection[] = build.implementations.map(({ contractId, version, digest }) => ({
        siteId: "default",
        installationId: "fixture-provider",
        contractId,
        version,
        digest,
    }));
    // This runtime consumer is explicit in createCollectionUpgradeAnalysis; its denial must stay invalid.
    const mandatory = { contractId: "ulvia/cms.observability", capabilityId: "logs.query" };
    const usage: CapabilityUsageEvidence = {
        complete: true,
        revision: "fixture-required-consumers",
        unknown: [],
        requirements: [{ ...mandatory, location: "internal:edge-provider/ulvia/cms.observability/logs.query" }],
    };
    const evaluate = (denied: (typeof mandatory)[]) =>
        validateCapabilityUsage(usage, selections, selections, { default: "allow-selected", denied }, [], releases);
    const refused = await evaluate([mandatory]);
    expect(refused).toContainEqual(expect.objectContaining({ code: "required-grant" }));
    expect(await evaluate([DENIED_READ])).toEqual([]);
    expect(await evaluate([])).toEqual([]);
});
