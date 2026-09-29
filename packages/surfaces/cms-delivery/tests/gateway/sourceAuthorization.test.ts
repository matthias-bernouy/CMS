import { describe, expect, test } from "bun:test";
import { InMemorySourceRepository, type SourceEndpoint } from "@bernouy/cms-sources";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { authorizeDeliverySourceEndpoint } from "cms-delivery/core/sources/authorization";
import { handleDeliverySourceRequest } from "cms-delivery/core/sources/executeSourceRequest";
import { CaptureRunner } from "./support/CaptureRunner";

describe("authorizeDeliverySourceEndpoint", () => {
    test("does not mount public Source routes", () => {
        const runner = new CaptureRunner();
        new DeliveryCms({
            runner,
            repository: {} as never,
            sources: new InMemorySourceRepository(),
        });
        expect(() => runner.defaultHandler("GET", "/.cms/sources")).toThrow();
    });

    test("does not resolve obsolete system Sources for internal indexing", async () => {
        const delivery = new DeliveryCms({
            runner: new CaptureRunner(),
            repository: {} as never,
            sources: new InMemorySourceRepository(),
        });
        const response = await handleDeliverySourceRequest(
            delivery,
            new Request("http://site/.cms/sources/system-site/organization"),
        );
        expect(response.status).toBe(404);
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
