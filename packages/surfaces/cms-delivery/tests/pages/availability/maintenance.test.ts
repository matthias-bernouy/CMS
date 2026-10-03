import { expect, test } from "bun:test";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { createDeliveryMaintenanceGuard } from "cms-delivery/core/maintenance";

test("returns an uncached service-unavailable response while collection maintenance is active", async () => {
    const delivery = {
        maintenance: {
            siteId: "site",
            migrations: { getActive: async () => ({ id: "migration", status: "migrating" }) },
        },
    } as unknown as DeliveryCms;
    const response = await createDeliveryMaintenanceGuard(delivery)(
        new Request("https://site.test/page"),
        async () => new Response("published"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({ code: "site_maintenance", migrationId: "migration", status: "migrating" });
});
