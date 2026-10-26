import { expect, test } from "bun:test";
import {
    ContractUpgradeService,
    InMemoryContractSelectionStore,
    capabilityGranted,
} from "@bernouy/cms-repository/providers/selections";
import { MemorySiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import { graphFixture, siteId } from "../fixtures";

async function fixture() {
    const f = await graphFixture();
    const dependencies = {
        capture: async () => ({ ...f.context, revision: "dependencies:1" }),
        isCurrent: async () => true,
    };
    const selections = new InMemoryContractSelectionStore(dependencies);
    await selections.replace(siteId, [await f.select("emailer")], 0);
    const evidence = {
        complete: true,
        revision: "usage:1",
        requirements: [] as { contractId: string; capabilityId: string; versionRange: string; location: string }[],
        unknown: [] as string[],
    };
    const served = { available: true, revision: "served:1" };
    const service = new ContractUpgradeService(selections, dependencies, new MemorySiteUpgradeStorage(), {
        usage: async () => structuredClone(evidence),
        served: async () => ({ ...served }),
    });
    return { ...f, service, selections, evidence, served };
}

test("a required old capability blocks a major replacement with its concrete location", async () => {
    const f = await fixture();
    f.evidence.requirements.push({
        contractId: "emailer",
        capabilityId: "send",
        versionRange: "^1.0.0",
        location: "page:/contact/form",
    });
    const plan = await f.service.plan(siteId, [await f.select("emailer", "2.0.0")]);
    expect(plan.status).toBe("blocked");
    expect(plan.issues).toContainEqual(
        expect.objectContaining({ code: "required-capability", location: "page:/contact/form" }),
    );
});

test("unknown consumers and missing source/target coexistence fail closed", async () => {
    const f = await fixture();
    f.evidence.complete = false;
    expect((await f.service.plan(siteId, [await f.select("emailer", "2.0.0")])).status).toBe("incomplete");
    f.evidence.complete = true;
    f.served.available = false;
    const plan = await f.service.plan(siteId, [await f.select("emailer", "2.0.0")]);
    expect(plan.status).toBe("blocked");
    expect(plan.issues.some(({ code }) => code === "release-not-served")).toBe(true);
});

test("unused capabilities may be denied without changing the exact selection", async () => {
    const f = await fixture();
    const target = [await f.select("emailer")];
    const grants = { default: "allow-selected" as const, denied: [{ contractId: "emailer", capabilityId: "send" }] };
    const plan = await f.service.plan(siteId, target, grants);
    expect(plan.status).toBe("applicable");
    const completed = await f.service.apply(siteId, target, grants, plan.planDigest);
    expect(completed.status).toBe("completed");
    const current = (await f.selections.get(siteId))!;
    expect(current.revision).toBe(2);
    expect(current.plan.selections).toEqual(target);
    expect(capabilityGranted(current.grants, "emailer", "send")).toBe(false);
});

test("required capabilities cannot lose their execution grants", async () => {
    const f = await fixture();
    f.evidence.requirements.push({
        contractId: "emailer",
        capabilityId: "send",
        versionRange: "^1.0.0",
        location: "internal:notifications",
    });
    const plan = await f.service.plan(siteId, [await f.select("emailer")], {
        default: "allow-selected",
        denied: [{ contractId: "emailer", capabilityId: "send" }],
    });
    expect(plan.status).toBe("blocked");
    expect(plan.issues).toContainEqual(
        expect.objectContaining({ code: "required-grant", location: "internal:notifications" }),
    );
});

test("usage changes invalidate a reviewed contract switch", async () => {
    const f = await fixture();
    const target = [await f.select("emailer", "2.0.0")];
    const plan = await f.service.plan(siteId, target);
    f.evidence.revision = "usage:2";
    await expect(f.service.apply(siteId, target, undefined, plan.planDigest)).rejects.toThrow("stale");
    expect((await f.selections.get(siteId))!.revision).toBe(1);
});
