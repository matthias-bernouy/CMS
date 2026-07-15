import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../../src/components/admin/Resources/Dashboards/types";
import { executeDashboardAction } from "../../../src/components/admin/Resources/Dashboards/runtime/actions";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail visibility", () => {
    test("reacts to nested field/resource expressions and preserves hidden local values", async () => {
        const widget = detailWidget();
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute("data-config-json", JSON.stringify(widget));
        detail.setAttribute("data-source-json", JSON.stringify({
            status: "draft",
            mode: "simple",
            locale: "fr",
            metadata: { localNote: "" },
        }));
        document.body.append(detail);
        await Promise.resolve();

        expect(fieldLabels(detail)).not.toContain("Local note");
        expect(actionLabels(detail)).not.toContain("Save advanced settings");

        change(detail, "mode", "advanced");
        expect(fieldLabels(detail)).toContain("Local note");
        expect(actionLabels(detail)).toContain("Save advanced settings");

        change(detail, "localNote", "Keep this draft");
        change(detail, "mode", "simple");
        expect(fieldLabels(detail)).not.toContain("Local note");

        change(detail, "mode", "advanced");
        expect(control(detail, "localNote").value).toBe("Keep this draft");
    });

    test("does not execute an action when its resource condition is false", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests++;
            return Response.json({ ok: true });
        }) as unknown as typeof fetch;

        await expect(executeDashboardAction(
            group(),
            dashboard(),
            { collection: "settingsDetail", row: "default" },
            "saveAdvanced",
            { mode: "advanced" },
            { status: "published", mode: "advanced" },
        )).rejects.toThrow(/not available in the current state/);
        expect(requests).toBe(0);
    });
});

function detailWidget(): Extract<DashboardWidget, { widget: "w-detail" }> {
    const visibleWhen = {
        all: [
            { value: "$resource.status", equals: "draft" as const },
            { any: [
                { value: "$field.mode", equals: "advanced" as const },
                { value: "$field.locale", notEquals: "fr" as const },
            ] },
        ],
    };
    return {
        widget: "w-detail",
        id: "settingsDetail",
        source: { endpoint: "setting" },
        actions: [{ id: "saveAdvanced", label: "Save advanced settings", endpoint: { endpoint: "save" }, visibleWhen }],
        main: [{
            id: "general",
            title: "General",
            fields: [
                { id: "mode", label: "Mode", path: "mode", type: "text" },
                { id: "locale", label: "Locale", path: "locale", type: "text" },
                { id: "localNote", label: "Local note", path: "metadata.localNote", type: "text", visibleWhen },
            ],
        }],
    };
}

function dashboard(): DashboardDto {
    return { id: "settings", source: "settings", views: [detailWidget()] };
}

function group(): DashboardSourceGroup {
    return {
        source: { urn: "urn:settings", id: "settings", name: "Settings", endpointCount: 1, dashboardCount: 1, readonly: false },
        endpoints: [{ endpointId: "save", method: "POST", targetUrl: "https://example.test/settings", params: [] }],
        dashboards: [],
    };
}

function change(detail: HTMLElement, field: string, value: string): void {
    const input = control(detail, field);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function control(detail: HTMLElement, field: string): HTMLElement & { value: string } {
    return detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(`[data-field-control='${field}']`)!;
}

function fieldLabels(detail: HTMLElement): string[] {
    return Array.from(detail.shadowRoot!.querySelectorAll<HTMLElement>("[data-field-label]")).map(label => label.textContent ?? "");
}

function actionLabels(detail: HTMLElement): string[] {
    return Array.from(detail.shadowRoot!.querySelectorAll<HTMLElement>("[data-action]")).map(action => action.textContent ?? "");
}
