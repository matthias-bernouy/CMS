import { afterEach, expect, test } from "bun:test";
import type { IntegrationHealthEnvelope } from "@bernouy/cms-integrations";
import { renderHealth } from "cms-control/components/admin/Resources/Integrations/management/presentation/health";
import { renderSettings } from "cms-control/components/admin/Resources/Integrations/management/settings";
import { managementRequest } from "cms-control/components/admin/Resources/Integrations/management/api";
import { executeEndpointAction } from "cms-control/components/admin/Resources/Dashboards/runtime/actions/endpoint";
import { WIDGET_ACTION_EVENT } from "cms-control/components/admin/Resources/Dashboards/widgets/shared";
import { renderSourceManagement } from "cms-control/components/admin/Resources/Dashboards/navigation/management";
import { detail } from "./support";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    document.head.replaceChildren();
});

test("health distinguishes stale ready observations and exposes registered recovery actions only", () => {
    const root = document.createElement("div");
    const calls: string[] = [];
    const health: IntegrationHealthEnvelope = {
        schemaVersion: 1,
        installationId: "stripe",
        observedAt: "2026-09-06T10:00:00Z",
        freshness: "stale",
        observation: "unreachable",
        report: {
            schemaVersion: 1,
            status: "ready",
            checkedAt: "2026-09-06T09:00:00Z",
            configuration: { savedRevision: "r2", appliedRevision: "r1" },
            checks: [
                {
                    id: "webhooks",
                    status: "warning",
                    message: "Webhooks need updating",
                    actionIds: ["apply-settings", "unknown-action"],
                },
            ],
            operation: { id: "apply-2", status: "running", steps: [{ id: "webhooks", status: "pending" }] },
        },
    };
    renderHealth(
        root,
        health,
        {
            schemaVersion: 1,
            settings: { readFunctionId: "read", saveFunctionId: "save", applyFunctionId: "apply", fields: [] },
        },
        (id) => calls.push(id),
    );
    expect(root.textContent).toContain("Last observed service: ready");
    expect(root.textContent).toContain("unreachable · stale");
    expect(root.textContent).toContain("waiting to be applied");
    expect(root.textContent).toContain("apply-2: running");
    expect(root.querySelectorAll("button")).toHaveLength(1);
    root.querySelector("button")!.click();
    expect(calls).toEqual(["apply-settings"]);
    renderHealth(root, { ...health, freshness: "unavailable", report: null }, { schemaVersion: 1 }, () => {});
    expect(root.textContent).not.toContain("ready");
    expect(root.textContent).toContain("No valid service observation");
});

test("settings use DashboardField paths and preserve untouched nested values", () => {
    const root = document.createElement("div");
    document.body.append(root);
    let saved: unknown;
    renderSettings(
        root,
        [{ id: "currency", label: "Currency", path: "market.currency", type: "text" }],
        {
            values: { market: { currency: "EUR", country: "FR" }, hidden: 42 },
            savedRevision: "2",
            appliedRevision: "1",
        },
        (values) => {
            saved = values;
        },
    );
    root.firstElementChild!.dispatchEvent(
        new CustomEvent(WIDGET_ACTION_EVENT, {
            detail: { action: "save-settings", fields: { currency: "USD" } },
            bubbles: true,
        }),
    );
    expect(saved).toEqual({ market: { currency: "USD", country: "FR" }, hidden: 42 });
});

test("settings save sends expected revision and management dashboard actions unwrap the canonical resource", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({
            values: { contextKey: "signup", revision: "3" },
            savedRevision: "3",
            appliedRevision: "3",
        });
    }) as typeof fetch;
    await managementRequest("commerce", "settings", { values: { country: "FR" }, expectedRevision: "2" });
    const result = await executeEndpointAction(
        {} as never,
        [],
        {
            id: "save",
            label: "Publish",
            management: {
                installationId: "consent",
                action: "save-settings",
                body: {
                    contextKey: "$resource.key",
                    expectedRevision: "$resource.revision",
                    documents: "$field.documents",
                },
            },
        },
        { resource: { key: "signup", revision: "2" }, fields: { documents: [{ page: "/terms" }] } },
    );
    expect(requests).toEqual([
        {
            url: "/api/integrations/management/settings?id=commerce",
            body: { values: { country: "FR" }, expectedRevision: "2" },
        },
        {
            url: "/api/integrations/management/settings?id=consent",
            body: { contextKey: "signup", expectedRevision: "2", documents: [{ page: "/terms" }] },
        },
    ]);
    expect(result).toMatchObject({ kind: "value", value: { contextKey: "signup", revision: "3" } });
});

test("source-less extension settings are listed under the real parent source", () => {
    const menu = document.createElement("div");
    renderSourceManagement(menu, "shop-source", [
        { ...detail(), id: "commerce", label: "Commerce", sourceIds: ["shop-source"] },
        { ...detail(), id: "stripe", label: "Stripe", sourceIds: [], extensionOf: { kind: "commerce" } },
    ]);
    expect(menu.children).toHaveLength(2);
    expect(menu.textContent).toContain("Stripe settings");
    expect(menu.lastElementChild?.getAttribute("href")).toBe("/admin/sources?source=shop-source&integration=stripe");
});
