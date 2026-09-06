import { afterEach, expect, test } from "bun:test";
import "cms-control/components/admin/Resources/Integrations/management/IntegrationManagement";
import { WIDGET_ACTION_EVENT } from "cms-control/components/admin/Resources/Dashboards/widgets/shared";
import { detail, flush } from "./support";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

test("connection save reloads canonical settings, health reads never apply, and stale fields do not survive reload", async () => {
    history.replaceState(null, "", "/admin/sources?integration=service");
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    let settings = { values: { country: "FR" }, savedRevision: "v1", appliedRevision: "v1" };
    globalThis.fetch = (async (input, init) => {
        const path = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path, method, body });
        if (path.includes("/installations?")) {
            return Response.json({
                ...detail(),
                id: "service",
                definition: {
                    kind: "service",
                    label: "Service",
                    inputs: [],
                    management: {
                        schemaVersion: 1,
                        health: { functionId: "health" },
                        settings: {
                            readFunctionId: "read",
                            saveFunctionId: "save",
                            applyFunctionId: "apply",
                            fields: [{ id: "country", path: "country", label: "Country", type: "text" }],
                        },
                    },
                },
            });
        }
        if (path.includes("/health?")) {
            return Response.json({
                schemaVersion: 1,
                installationId: "service",
                observedAt: "2026-09-06T10:00:00Z",
                freshness: "fresh",
                observation: "valid",
                report: {
                    schemaVersion: 1,
                    status: "ready",
                    checkedAt: "2026-09-06T10:00:00Z",
                    configuration: { savedRevision: "v2", appliedRevision: "v2" },
                    checks: [],
                },
            });
        }
        if (method === "POST") {
            settings = { values: body.values, savedRevision: "v2", appliedRevision: "v2" };
        }
        return Response.json(settings);
    }) as typeof fetch;
    const host = document.createElement("cms-integration-management");
    host.setAttribute("installation-id", "service");
    document.body.append(host);
    await flush();
    await flush();
    expect(host.textContent).toContain("Deployment: success");
    const editor = host.querySelector("cms-dashboard-w-detail")!;
    expect(editor.shadowRoot?.querySelector("[data-field-control='country']")?.getAttribute("value")).toBe("FR");
    editor.dispatchEvent(
        new CustomEvent(WIDGET_ACTION_EVENT, {
            detail: { action: "save-settings", fields: { country: "BE" } },
            bubbles: true,
        }),
    );
    await flush();
    await flush();
    expect(calls.filter((call) => call.method === "POST")).toEqual([
        {
            path: "/api/integrations/management/settings?id=service",
            method: "POST",
            body: { values: { country: "BE" }, expectedRevision: "v1" },
        },
    ]);
    expect(
        host
            .querySelector("cms-dashboard-w-detail")
            ?.shadowRoot?.querySelector("[data-field-control='country']")
            ?.getAttribute("value"),
    ).toBe("BE");
    expect(host.textContent).toContain("Settings saved.");
    expect(host.textContent).not.toContain("Retry applying");
    host.querySelector<HTMLButtonElement>("[data-panel='health']")!.click();
    await flush();
    expect(host.textContent).toContain("Service: ready");
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("late settings responses do not replace the selected Health panel", async () => {
    let releaseSettings: ((response: Response) => void) | undefined;
    globalThis.fetch = (async (input) => {
        const path = String(input);
        if (path.includes("/installations?")) {
            return Response.json({
                ...detail(),
                id: "service",
                definition: {
                    kind: "service",
                    label: "Service",
                    inputs: [],
                    management: {
                        schemaVersion: 1,
                        settings: { readFunctionId: "read", saveFunctionId: "save", fields: [] },
                    },
                },
            });
        }
        if (path.includes("/settings?")) {
            return new Promise<Response>((resolve) => {
                releaseSettings = resolve;
            });
        }
        return Response.json({
            schemaVersion: 1,
            installationId: "service",
            observedAt: "2026-09-06T10:00:00Z",
            freshness: "unavailable",
            observation: "unsupported",
            report: null,
        });
    }) as typeof fetch;
    const host = document.createElement("cms-integration-management");
    host.setAttribute("installation-id", "service");
    document.body.append(host);
    await flush();
    host.querySelector<HTMLButtonElement>("[data-panel='health']")!.click();
    await flush();
    releaseSettings!(Response.json({ values: {}, savedRevision: null, appliedRevision: null }));
    await flush();
    expect(host.querySelector("cms-dashboard-w-detail")).toBeNull();
    expect(host.textContent).toContain("No valid service observation");
});
