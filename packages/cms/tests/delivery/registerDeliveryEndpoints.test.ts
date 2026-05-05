import { describe, test, expect } from "bun:test";
import { registerDeliveryEndpoints } from "src/delivery/registerDeliveryEndpoints";
import { makeDelivery } from "./helpers";

function paths(endpoints: { method: string; path: string }[]): string[] {
    return endpoints.filter(e => e.method === "GET").map(e => e.path).sort();
}

describe("registerDeliveryEndpoints", () => {
    test("registers every expected asset + crawler route", () => {
        const delivery = makeDelivery();
        registerDeliveryEndpoints(delivery);
        const runner = delivery.runner as any;
        expect(paths(runner._endpoints)).toEqual([
            "/.cms/assets/component.js",
            "/.cms/assets/favicon",
            "/.cms/bloc",
            "/.cms/style",
            "/robots.txt",
            "/sitemap.xml",
        ]);
    });

    test("registers a default GET endpoint for page resolution", () => {
        const delivery = makeDelivery();
        registerDeliveryEndpoints(delivery);
        const def = (delivery.runner as any)._getDefault();
        expect(def).not.toBeNull();
        expect(def.method).toBe("GET");
        expect(typeof def.handler).toBe("function");
    });

    test("does NOT register a media endpoint — MediaUrlBuilder serves URLs directly", () => {
        const delivery = makeDelivery();
        registerDeliveryEndpoints(delivery);
        const runner = delivery.runner as any;
        const mediaRoute = runner._endpoints.find((e: any) => e.path.endsWith("/media"));
        expect(mediaRoute).toBeUndefined();
    });

    test("routes are registered relative to the runner — the scoped runner prepends basePath itself", () => {
        // Paths registered by Delivery are always relative ("/bloc", not
        // "/tenant-1/.cms/bloc"). Scoping happens inside the scoped runner
        // via `group(...)`, which isn't exercised by our test runner stub
        // — but we can still assert that Delivery passes relative paths.
        const delivery = makeDelivery({ basePath: "/tenant-1" });
        registerDeliveryEndpoints(delivery);
        const runner = delivery.runner as any;
        expect(paths(runner._endpoints)).toEqual([
            "/.cms/assets/component.js",
            "/.cms/assets/favicon",
            "/.cms/bloc",
            "/.cms/style",
            "/robots.txt",
            "/sitemap.xml",
        ]);
    });
});
