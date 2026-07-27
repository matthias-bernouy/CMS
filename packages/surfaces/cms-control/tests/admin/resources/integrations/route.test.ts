import { afterEach, describe, expect, test } from "bun:test";
import {
    currentIntegrationRoute,
    integrationRouteUrl,
    pushIntegrationRoute,
    replaceIntegrationRoute,
} from "cms-control/components/admin/Resources/Integrations/api";

afterEach(() => {
    document.head.innerHTML = "";
    history.replaceState(null, "", "/");
});

describe("integration admin routes", () => {
    test("builds URLs for list, setup, and installed detail", () => {
        expect(integrationRouteUrl({ view: "list", tab: "installed" })).toBe("/admin/integrations");
        expect(integrationRouteUrl({ view: "list", tab: "catalogue" })).toBe("/admin/integrations?tab=catalogue");
        expect(integrationRouteUrl({ view: "setup", kind: "stripe-connect" })).toBe(
            "/admin/integrations?setup=stripe-connect",
        );
        expect(integrationRouteUrl({ view: "installation", id: "orders" })).toBe(
            "/admin/integrations?integration=orders",
        );
    });

    test("reads and updates the current integration route", () => {
        history.replaceState(null, "", "/admin/integrations?setup=user-account");
        expect(currentIntegrationRoute()).toEqual({ view: "setup", kind: "user-account" });

        pushIntegrationRoute({ view: "installation", id: "user-account" });
        expect(currentIntegrationRoute()).toEqual({ view: "installation", id: "user-account" });

        replaceIntegrationRoute({ view: "list", tab: "catalogue" });
        expect(currentIntegrationRoute()).toEqual({ view: "list", tab: "catalogue" });
    });
});
