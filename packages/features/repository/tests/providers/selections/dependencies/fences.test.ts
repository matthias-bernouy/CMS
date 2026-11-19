import { expect, test } from "bun:test";
import { planContractSelections } from "@bernouy/ulvia-providers/selections";
import { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";
import { InMemoryContractSelectionStore } from "repository/providers/selections/default-implementation/InMemoryContractSelectionStore";
import { captureFixture } from "./fixture";
import { siteId } from "../fixtures";

test("old captures stay immutable while fresh captures and final fences observe yank, deprecation and ABA changes", async () => {
    const f = await captureFixture();
    const original = await f.dependencies.capture(siteId);
    await f.releases.setYank("ulvia/payment", "1.0.0", { reason: "Retired" });
    expect(await f.dependencies.isCurrent(siteId, original.revision)).toBeFalse();
    expect((await original.releases.get("ulvia/payment", "1.0.0"))!.yank).toBeUndefined();
    expect((await (await f.dependencies.capture(siteId)).releases.get("ulvia/payment", "1.0.0"))!.yank).toEqual({
        reason: "Retired",
    });
    await f.releases.setYank("ulvia/payment", "1.0.0", null);
    expect(await f.dependencies.isCurrent(siteId, original.revision)).toBeFalse();
    let captured = await f.dependencies.capture(siteId);
    await f.releases.setDeprecation("ulvia/payment", "1.0.0", { reason: "Prefer newer" });
    expect(await f.dependencies.isCurrent(siteId, captured.revision)).toBeFalse();
    captured = await f.dependencies.capture(siteId);
    await f.manifests.setYank(f.installation.providerId, "1.0.0", { reason: "Retired" });
    expect(await f.dependencies.isCurrent(siteId, captured.revision)).toBeFalse();
    expect(
        (await (await f.dependencies.capture(siteId)).manifests.get(f.installation.providerId, "1.0.0"))!.yank,
    ).toEqual({ reason: "Retired" });
});

test("installation changes and cross-instance use remain fenced", async () => {
    const f = await captureFixture();
    const target = [await f.select("ulvia/emailer")];
    for (const status of ["disabled", "revoked"] as const) {
        const captured = await f.dependencies.capture(siteId);
        f.installationStatus(status);
        expect(await f.dependencies.isCurrent(siteId, captured.revision)).toBeFalse();
        expect((await f.dependencies.capture(siteId)).installations[0]!.status).toBe(status);
    }
    const other = await f.dependencies.capture("site:OTHER");
    expect(other.installations).toEqual([]);
    await expect(planContractSelections("site:OTHER", target, other)).rejects.toThrow();
});

test("capture still reads and validates the entire catalogue and retries unstable revisions", async () => {
    const f = await captureFixture();
    let churn = true;
    const releases = new Proxy(f.releases, {
        get(source, key) {
            if (key === "list") {
                return async () => {
                    const records = await source.list();
                    if (churn) {
                        await source.setDeprecation("ulvia/payment", "1.0.0", { reason: "Changed during read" });
                    }
                    return records;
                };
            }
            return Reflect.get(source, key);
        },
    });
    const dependencies = new CatalogueSelectionDependencies(releases, f.manifests, f.installationStore);
    await expect(dependencies.capture(siteId)).rejects.toMatchObject({ code: "stale_dependencies" });
    expect(f.calls.get("release.list")).toBe(3);
    churn = false;
    expect((await dependencies.capture(siteId)).revision).toBeString();
    const corrupt = new Proxy(f.releases, {
        get(source, key) {
            return key === "list"
                ? async () => {
                      throw new Error("unrelated stored artifact corruption");
                  }
                : Reflect.get(source, key);
        },
    });
    const invalid = new CatalogueSelectionDependencies(corrupt, f.manifests, f.installationStore);
    await expect(invalid.capture(siteId)).rejects.toThrow("unrelated stored artifact corruption");
});

test("selection writes retain their final fresh dependency check and refusal leaves state unchanged", async () => {
    const f = await captureFixture();
    const dependencies = {
        capture: async (site: string) => {
            const snapshot = await f.dependencies.capture(site);
            f.installationStatus("disabled");
            return snapshot;
        },
        isCurrent: (site: string, revision: string) => f.dependencies.isCurrent(site, revision),
    };
    const store = new InMemoryContractSelectionStore(dependencies);
    await expect(store.replace(siteId, [await f.select("ulvia/emailer")], 0)).rejects.toMatchObject({
        code: "stale_dependencies",
    });
    expect(await store.get(siteId)).toBeNull();
});
