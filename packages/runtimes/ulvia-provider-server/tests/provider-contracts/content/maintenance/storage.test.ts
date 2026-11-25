import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage } from "@bernouy/repository/upgrades";
import { collectionMaintenanceResponse } from "@bernouy/repository/collections/http";
import { NOOP_LOGGER } from "@bernouy/logging";
import { withMaintenancePages } from "../../../../src/runtime/content/maintenance/storage";
import { fixture, id, request } from "./fixture";

function intent() {
    return {
        id,
        siteId: "site",
        kind: "contracts",
        planDigest: id,
        sourceStateDigest: id,
        targetStateDigest: id,
        expectedRevision: 1,
        createdAt: new Date().toISOString(),
        status: "prepared" as const,
        payload: {},
    };
}
test("maintenance begins after the snapshot and keeps API refusals and recovery available", async () => {
    const f = fixture();
    const raw = new MemorySiteUpgradeStorage();
    const storage = withMaintenancePages(raw, f.pages, NOOP_LOGGER);
    f.pages.configure(async () => {
        expect(await raw.getActive("site")).toBeNull();
        return { html: "Our error design", resources: [] };
    });
    const options = {
        siteId: "site",
        upgrades: storage,
        basePath: "",
        pageResponse: (req: Request) => f.pages.page(req, id),
    };
    expect(await collectionMaintenanceResponse(request(), options)).toBeNull();
    await storage.begin(intent());
    const page = (await collectionMaintenanceResponse(request(), options))!;
    expect(page.status).toBe(503);
    expect(await page.text()).toBe("Our error design");
    const api = (await collectionMaintenanceResponse(
        request("/.cms/mutation/ulvia/cms.content/page.update", "POST"),
        options,
    ))!;
    expect(api.status).toBe(423);
    expect(await api.json()).toMatchObject({ code: "site_maintenance", upgradeId: id });
    expect(
        await collectionMaintenanceResponse(
            request("/.cms/call/ulvia/cms.installations/get-site-upgrade-status"),
            options,
        ),
    ).toBeNull();
    await storage.transition("site", id, "prepared", "applying");
    expect([...f.rows.values()][0]!.expiresAt).toBeUndefined();
    await storage.transition("site", id, "applying", "completed");
    expect(await collectionMaintenanceResponse(request(), options)).toBeNull();
    expect([...f.rows.values()][0]!.expiresAt).toBeInstanceOf(Date);
    await storage.begin(intent());
    expect(f.rows.size).toBe(1);
});

test("preparation failures leave the site available and another active upgrade is preserved", async () => {
    const f = fixture();
    const raw = new MemorySiteUpgradeStorage();
    const storage = withMaintenancePages(raw, f.pages, NOOP_LOGGER);
    f.pages.configure(async () => {
        throw new Error("Disk unavailable");
    });
    await expect(storage.begin(intent())).rejects.toThrow("Disk unavailable");
    expect(await raw.getActive("site")).toBeNull();
    f.pages.configure(async () => ({ html: "Frozen", resources: [] }));
    await storage.begin(intent());
    const next = { ...intent(), id: `sha256:${"b".repeat(64)}` };
    await expect(storage.begin(next)).rejects.toMatchObject({ status: 423 });
    expect((await raw.getActive("site"))?.id).toBe(id);
    expect([...f.rows.values()].find((row) => row._id.includes(next.id))!.expiresAt).toBeInstanceOf(Date);
});
