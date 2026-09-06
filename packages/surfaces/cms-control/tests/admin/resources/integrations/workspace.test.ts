import { afterEach, expect, test } from "bun:test";
import "cms-control/components/admin/Resources/Sources/ResourceWorkspace";
import { DashboardView } from "cms-control/components/admin/Resources/Dashboards/view/DashboardView";
import { WIDGET_ROW_SELECT_EVENT } from "cms-control/components/admin/Resources/Dashboards/widgets/shared";

afterEach(() => {
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

test("Sources switches to the shared catalogue and restores data navigation", () => {
    history.replaceState(null, "", "/admin/sources");
    const workspace = document.createElement("cms-resource-workspace");
    const data = document.createElement("div");
    data.textContent = "Source data";
    workspace.append(data);
    document.body.append(workspace);
    expect(data.hidden).toBe(false);
    history.replaceState(null, "", "/admin/sources?tab=catalogue");
    window.dispatchEvent(new Event("cms-resources:route"));
    expect(data.hidden).toBe(true);
    expect(workspace.querySelector("cms-integrations-admin")?.hasAttribute("hidden")).toBe(false);
    history.replaceState(null, "", "/admin/sources?source=commerce");
    window.dispatchEvent(new Event("cms-dashboards:selection"));
    expect(data.hidden).toBe(false);
    expect(workspace.querySelector("cms-integrations-admin")?.hasAttribute("hidden")).toBe(true);
});

test("embedded settings dashboard selections keep the installation route", () => {
    history.replaceState(null, "", "/admin/sources?integration=consent");
    const view = document.createElement("cms-dashboards-admin") as DashboardView;
    view.setAttribute("external", "");
    view.setAttribute("embedded", "");
    document.body.append(view);
    view.setExternalContext([], { source: "consent", dashboard: "contexts" });
    view.shadowRoot!.dispatchEvent(
        new CustomEvent(WIDGET_ROW_SELECT_EVENT, {
            detail: { collection: "context", rowKey: "buyer_checkout" },
            bubbles: true,
        }),
    );
    expect(location.pathname + location.search).toBe("/admin/sources?integration=consent");
});

test("Sources hides dashboard children parsed after the workspace connected", async () => {
    history.replaceState(null, "", "/admin/sources?tab=catalogue");
    const workspace = document.createElement("cms-resource-workspace");
    document.body.append(workspace);
    workspace.insertAdjacentHTML("beforeend", "<cms-dashboards-admin external></cms-dashboards-admin>");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(workspace.querySelector("cms-dashboards-admin")?.hasAttribute("hidden")).toBe(true);
    expect(workspace.querySelector("cms-integrations-admin")?.hasAttribute("hidden")).toBe(false);
});
