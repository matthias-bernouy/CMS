import { expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "../src/exports";

test("site dashboards require matching revisions and stay scoped to the site", async () => {
    const repository = new InMemoryDashboardRepository();
    const record = {
        id: "dashboard-1",
        siteId: "site-a",
        name: "Workspace",
        enabled: false,
        revision: 1,
        navigation: [{ id: "overview", label: "Overview", use: "test:overview" }],
    };
    await repository.create(record);
    expect(await repository.get("site-b", record.id)).toBeNull();
    expect(await repository.replace({ ...record, enabled: true, revision: 2 }, 0)).toBe(false);
    expect(await repository.replace({ ...record, enabled: true, revision: 2 }, 1)).toBe(true);
    expect((await repository.get("site-a", record.id))?.enabled).toBe(true);
    expect(await repository.delete("site-b", record.id, 2)).toBe(false);
    expect(await repository.delete("site-a", record.id, 1)).toBe(false);
    expect(await repository.delete("site-a", record.id, 2)).toBe(true);
    expect(await repository.get("site-a", record.id)).toBeNull();
});
