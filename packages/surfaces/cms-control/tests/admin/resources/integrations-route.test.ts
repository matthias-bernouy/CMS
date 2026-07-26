import { afterEach, describe, expect, test } from "bun:test";
import {
    currentIntegrationRoute,
    IntegrationApiError,
    integrationUpgradeVersions,
    integrationRouteUrl,
    pushIntegrationRoute,
    replaceIntegrationRoute,
    upgradeIntegrationInstallation,
} from "cms-control/components/admin/Resources/Integrations/api";
import {
    confirmIntegrationUpgrade,
    integrationUpgradeErrorMessage,
    renderUpgradeChoices,
} from "cms-control/components/admin/Resources/Integrations/ui/actions/installation";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
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

describe("explicit integration upgrade UI", () => {
    test("loads newer exact versions and submits only the confirmed target", async () => {
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        const requests: Array<{ url: string; method: string; body: unknown }> = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            requests.push({
                url,
                method: init?.method ?? "GET",
                body: init?.body ? JSON.parse(String(init.body)) : null,
            });
            if (url.includes("/versions")) {
                return Response.json({
                    id: "commerce",
                    current: "1.0.0",
                    stable: "1.1.0",
                    latest: "2.0.0-beta.1",
                    versions: ["1.1.0", "2.0.0-beta.1"],
                });
            }
            return Response.json({ installation: { definitionVersion: "1.1.0" } });
        }) as unknown as typeof fetch;

        const choices = await integrationUpgradeVersions("commerce");
        await upgradeIntegrationInstallation("commerce", choices.stable!);

        expect(requests).toEqual([
            {
                url: "/cms/api/integrations/installations/versions?id=commerce",
                method: "GET",
                body: null,
            },
            {
                url: "/cms/api/integrations/installations/upgrade?id=commerce",
                method: "POST",
                body: { version: "1.1.0" },
            },
        ]);
    });

    test("renders channel labels without converting them into mutable upgrade targets", () => {
        const panel = upgradePanel();

        renderUpgradeChoices(panel, {
            id: "commerce",
            current: "1.0.0",
            stable: "1.1.0",
            latest: "2.0.0-beta.1",
            versions: ["1.1.0", "2.0.0-beta.1"],
        });

        const select = panel.querySelector<HTMLSelectElement>("[data-upgrade-target]")!;
        expect(Array.from(select.options).map(({ value, textContent }) => ({ value, textContent }))).toEqual([
            { value: "1.1.0", textContent: "1.1.0 (stable)" },
            { value: "2.0.0-beta.1", textContent: "2.0.0-beta.1 (latest)" },
        ]);
        expect(select.value).toBe("1.1.0");
        expect(panel.querySelector<HTMLInputElement>("[data-upgrade-confirmation]")?.placeholder).toBe("1.1.0");
        expect(panel.textContent).toContain("Select and confirm an exact target version");
    });

    test("does not submit until the administrator types the exact selected version", async () => {
        const panel = upgradePanel();
        panel.dataset.integrationId = "commerce";
        const button = document.createElement("button");
        button.dataset.upgradeConfirm = "";
        panel.append(button);
        renderUpgradeChoices(panel, {
            id: "commerce",
            current: "1.0.0",
            stable: "1.1.0",
            versions: ["1.1.0"],
        });
        let requests = 0;
        globalThis.fetch = (async () => {
            requests++;
            return Response.json({});
        }) as unknown as typeof fetch;

        panel.querySelector<HTMLInputElement>("[data-upgrade-confirmation]")!.value = "stable";
        await confirmIntegrationUpgrade(button);
        expect(requests).toBe(0);
        expect(panel.querySelector("[data-upgrade-status]")?.textContent).toContain("Type 1.1.0 exactly");

        panel.querySelector<HTMLInputElement>("[data-upgrade-confirmation]")!.value = "1.1.0";
        await confirmIntegrationUpgrade(button);
        expect(requests).toBe(1);
    });

    test("turns repository conflicts, validation failures, and outages into actionable messages", () => {
        expect(integrationUpgradeErrorMessage(new IntegrationApiError(409, "conflict"))).toContain(
            "Reload the available versions",
        );
        expect(integrationUpgradeErrorMessage(new IntegrationApiError(422, "dependency range failed"))).toContain(
            "dependency range failed",
        );
        expect(integrationUpgradeErrorMessage(new IntegrationApiError(503, "offline"))).toContain(
            "installed version remains unchanged",
        );
    });
});

function upgradePanel(): HTMLElement {
    const panel = document.createElement("section");
    panel.dataset.upgradePanel = "";
    panel.innerHTML = `
        <div data-upgrade-form hidden>
            <select data-upgrade-target></select>
            <input data-upgrade-confirmation />
        </div>
        <p data-upgrade-status></p>
    `;
    return panel;
}
