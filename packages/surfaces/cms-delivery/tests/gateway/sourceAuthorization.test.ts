import { describe, expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { InMemorySourceRepository, SYSTEM_SITE_SOURCE, type SourceEndpoint } from "@bernouy/cms-sources";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { authorizeDeliverySourceEndpoint } from "cms-delivery/core/sources/authorization";
import { CaptureRunner } from "./support/CaptureRunner";

describe("authorizeDeliverySourceEndpoint", () => {
    test("always exposes the public site organization system endpoint", async () => {
        const result = await authorizeDeliverySourceEndpoint(
            {} as DeliveryCms,
            SYSTEM_SITE_SOURCE.endpoints[0]!,
            new Request("http://site/.cms/sources/system-site/organization"),
        );
        expect(result).toBe(true);
    });

    test("serves the organization without authentication", async () => {
        const settings = defaultSystem();
        settings.site.organization.name = "Public organization";
        const runner = new CaptureRunner();
        new DeliveryCms({
            runner,
            repository: { getSystem: async () => settings } as never,
            sources: new InMemorySourceRepository(),
        });

        const response = await runner.defaultHandler(
            "GET",
            "/.cms/sources",
        )(new Request("http://site/.cms/sources/system-site/organization"));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ name: "Public organization" });
    });

    test("uses only the endpoint exposure mode and authentication state", async () => {
        const request = new Request("http://site/.cms/sources/shop/products");
        expect(await authorizeDeliverySourceEndpoint({} as DeliveryCms, endpoint("products", "public"), request)).toBe(
            true,
        );
        expect(await authorizeDeliverySourceEndpoint({} as DeliveryCms, endpoint("orders", "auth"), request)).toEqual({
            authorized: false,
            status: 401,
        });
        expect(
            await authorizeDeliverySourceEndpoint({} as DeliveryCms, endpoint("orders", "auth"), request, {
                subject: { identifier: "member-1" },
            }),
        ).toBe(true);
    });
});

function endpoint(id: string, mode: SourceEndpoint["access"]["mode"]): SourceEndpoint {
    return {
        urn: `urn:shop:${id}`,
        method: "GET",
        access: { mode },
        targetUrl: `https://example.com/${id}`,
    };
}
