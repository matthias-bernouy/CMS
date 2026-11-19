import { expect, test } from "bun:test";
import { ContractUpgradeService } from "repository/providers/selections/core/upgrades/ContractUpgradeService";
import { InMemoryContractSelectionStore } from "repository/providers/selections/default-implementation/InMemoryContractSelectionStore";
import { MemorySiteUpgradeStorage } from "repository/site-upgrades/memory";
import { captureFixture } from "./fixture";
import { siteId } from "../fixtures";

test("snapshot and live-reader upgrade plans, diagnostics and digests are identical", async () => {
    const f = await captureFixture();
    const store = new InMemoryContractSelectionStore(f.dependencies);
    await store.replace(siteId, [await f.select("ulvia/emailer")], 0);
    const requirements: { contractId: string; capabilityId: string; versionRange: string; location: string }[] = [];
    const analysis = {
        usage: async () => ({ complete: true, revision: "usage:1", unknown: [], requirements }),
        served: async () => ({ available: true, revision: "served:1" }),
    };
    const optimized = new ContractUpgradeService(store, f.dependencies, new MemorySiteUpgradeStorage(), analysis);
    const live = new ContractUpgradeService(
        store,
        {
            capture: async (site) => ({
                ...(await f.dependencies.capture(site)),
                releases: f.releases,
                manifests: f.manifests,
            }),
            isCurrent: (site, revision) => f.dependencies.isCurrent(site, revision),
        },
        new MemorySiteUpgradeStorage(),
        analysis,
    );
    const target = [await f.select("ulvia/emailer", "2.0.0")];
    expect(await optimized.plan(siteId, target)).toEqual(await live.plan(siteId, target));
    requirements.push({
        contractId: "ulvia/emailer",
        capabilityId: "send",
        versionRange: "^1.0.0",
        location: "page:/contact",
    });
    const blocked = await optimized.plan(siteId, target);
    expect(blocked.status).toBe("blocked");
    expect(blocked).toEqual(await live.plan(siteId, target));
    requirements.length = 0;
    const reviewed = await optimized.plan(siteId, target);
    f.installationStatus("disabled");
    await expect(optimized.apply(siteId, target, undefined, reviewed.planDigest)).rejects.toThrow("stale");
    expect((await store.get(siteId))!.revision).toBe(1);
});

test("apply and resume preserve terminal state and exact selection revision", async () => {
    const f = await captureFixture();
    const store = new InMemoryContractSelectionStore(f.dependencies);
    await store.replace(siteId, [await f.select("ulvia/emailer")], 0);
    const service = new ContractUpgradeService(store, f.dependencies, new MemorySiteUpgradeStorage(), {
        usage: async () => ({ complete: true, revision: "usage:1", unknown: [], requirements: [] }),
        served: async () => ({ available: true, revision: "served:1" }),
    });
    const target = [await f.select("ulvia/emailer", "2.0.0")];
    const plan = await service.plan(siteId, target);
    expect(plan.status).toBe("applicable");
    const completed = await service.apply(siteId, target, undefined, plan.planDigest);
    expect(completed.status).toBe("completed");
    expect((await service.resume(siteId, completed.id)).status).toBe("completed");
    const current = (await store.get(siteId))!;
    expect(current.revision).toBe(2);
    expect(current.plan.selections).toEqual(target);
});
