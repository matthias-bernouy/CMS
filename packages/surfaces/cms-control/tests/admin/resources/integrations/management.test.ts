import "../../dashboards/detail/boundDetail";
import { waitForDetail } from "../../dashboards/detail/detailTestHelpers";
import { setSourceData } from "@bernouy/components";
import { afterEach, expect, test } from "bun:test";
import type { IntegrationHealthEnvelope } from "@bernouy/cms-integrations";
import { mountHealth } from "cms-control/components/admin/Resources/Integrations/health/presentation/health";
import { managementRequest } from "cms-control/components/admin/Resources/Integrations/management/api";
import { navigationContext } from "cms-control/components/admin/Resources/Dashboards/navigation/binding/context";
import { detail } from "./support";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    document.head.replaceChildren();
});

test("health distinguishes stale ready observations and exposes registered recovery actions only", async () => {
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
                    actionIds: ["repair", "unknown-action"],
                },
            ],
            operation: { id: "apply-2", status: "running", steps: [{ id: "webhooks", status: "pending" }] },
        },
    };
    const view = mountHealth(
        root,
        "stripe",
        {
            schemaVersion: 1,
            actions: [{ id: "repair", label: "Repair", functionId: "repair" }],
        },
        (id) => calls.push(id),
    );
    await mountHealthSource(root, view.element, health);
    expect(root.textContent).toContain("Last observed service: ready");
    expect(root.textContent).toContain("unreachable · stale");
    expect(root.textContent).toContain("waiting to be applied");
    expect(root.textContent).toContain("apply-2: running");
    expect(root.querySelectorAll("[data-health-action]")).toHaveLength(1);
    root.querySelector<HTMLButtonElement>("[data-health-action]")!.click();
    expect(calls).toEqual(["repair"]);
    setSourceData(view.element, { ...health, freshness: "unavailable", report: null });
    expect(root.textContent).not.toContain("ready");
    expect(root.textContent).toContain("No valid service observation");
});

test("management actions send only their declared input", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({
            values: { contextKey: "signup", revision: "3" },
            savedRevision: "3",
            appliedRevision: "3",
        });
    }) as typeof fetch;
    await managementRequest("commerce", "action", { actionId: "repair", input: { reason: "Retry" } });
    expect(requests).toEqual([
        {
            url: "/api/integrations/management/action?id=commerce",
            body: { actionId: "repair", input: { reason: "Retry" } },
        },
    ]);
});

test("source navigation no longer appends installation management panels", () => {
    const context = navigationContext()(
        [
            {
                source: {
                    id: "shop-source",
                    urn: "urn:shop",
                    name: "Shop",
                    endpointCount: 0,
                    dashboardCount: 0,
                    readonly: false,
                },
                endpoints: [],
                dashboards: [],
            },
            {
                source: {
                    id: "newsletter",
                    urn: "urn:newsletter",
                    name: "Newsletter",
                    endpointCount: 0,
                    dashboardCount: 0,
                    readonly: false,
                },
                endpoints: [],
                dashboards: [],
            },
        ],
        [
            { ...detail(), id: "commerce", label: "Commerce", sourceIds: ["shop-source"] },
            { ...detail(), id: "stripe", label: "Stripe", sourceIds: [], extensionOf: { kind: "commerce" } },
        ],
        "shop-source",
        "",
        false,
        "stripe",
        false,
    );
    const visible = context.navItems.filter((item) => !item.hidden);
    expect(visible.map((item) => item.label)).toEqual(["Shop", "Newsletter"]);
    expect(visible.every((item) => !item.href.includes("integration="))).toBe(true);
});

test("health does not equate absent revisions with applied configuration and explains observation failures", async () => {
    const root = document.createElement("div");
    const health: IntegrationHealthEnvelope = {
        schemaVersion: 1,
        installationId: "service",
        observedAt: "2026-09-06T10:00:00Z",
        freshness: "stale",
        observation: "unreachable",
        reason: "forbidden",
        httpStatus: 403,
        reportDefinitionVersion: "1.0.0",
        report: {
            schemaVersion: 1,
            status: "needs_configuration",
            checkedAt: "2026-09-06T09:00:00Z",
            configuration: { savedRevision: null, appliedRevision: null },
            checks: [],
        },
    };
    const view = mountHealth(root, "service", { schemaVersion: 1 }, () => {});
    await mountHealthSource(root, view.element, health);
    expect(root.textContent).toContain("No saved configuration revision was reported");
    expect(root.textContent).not.toContain("configuration is applied");
    expect(root.textContent).toContain("Observation issue: forbidden (HTTP 403)");
    expect(root.textContent).toContain("Observed version: 1.0.0");
    health.report!.configuration = { savedRevision: "r1", appliedRevision: "r1" };
    setSourceData(view.element, health);
    expect(root.textContent).toContain("was applied at the last observation");
    health.freshness = "fresh";
    setSourceData(view.element, health);
    expect(root.textContent).toContain("The saved configuration is applied");
});

async function mountHealthSource(
    root: HTMLElement,
    source: HTMLElement,
    health: IntegrationHealthEnvelope,
): Promise<void> {
    source.setAttribute("cms-source", "");
    setSourceData(source, health);
    const core = document.createElement("cms-binding-core");
    core.append(root);
    document.body.append(core);
    await waitForDetail(() => source.hasAttribute("cms-ready"));
}
