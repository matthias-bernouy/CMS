import { connectionGroups } from "../../../health/connectionView";
import type { Page } from "playwright";

export async function installConnectionRoutes(page: Page, bundle: string, styles: string, long = false) {
    const writes: Array<{ values: Record<string, unknown>; expectedRevision: string }> = [];
    const requests: string[] = [];
    let settings = {
        values: { country: "FR", mode: "test", enabled: false, notes: "Existing notes", metadata: { keep: true } },
        savedRevision: "v1",
        appliedRevision: "v1",
    };
    let failure = false;
    let readFailure = false;
    const actions: string[] = [];
    let pendingSave: Promise<void> | undefined;
    await page.route("http://cms.test/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        requests.push(`${request.method()} ${path}`);
        if (path === "/control.js") {
            await route.fulfill({ contentType: "text/javascript", body: bundle });
        } else if (path === "/style.css") {
            await route.fulfill({ contentType: "text/css", body: styles });
        } else if (request.resourceType() === "document") {
            await route.fulfill({
                contentType: "text/html",
                body: '<!doctype html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script src="/control.js"></script></head><body><cms-binding-core><w13c-fixed-admin-layout><cms-dashboards-admin embedded dashboard-id="service-connection"></cms-dashboards-admin></w13c-fixed-admin-layout></cms-binding-core></body>',
            });
        } else if (path === "/api/integrations/installations" || path === "/api/dashboards") {
            await route.fulfill({
                json:
                    path === "/api/dashboards"
                        ? connectionGroups([
                              { id: "country", label: "Country", path: "country", type: "text", required: true },
                              {
                                  id: "mode",
                                  label: "Mode",
                                  path: "mode",
                                  type: "select",
                                  options: [
                                      { value: "test", label: "Test" },
                                      { value: "live", label: "Live" },
                                  ],
                              },
                              { id: "enabled", label: "Enabled", path: "enabled", type: "checkbox" },
                              ...(long
                                  ? Array.from({ length: 24 }, (_, index) => ({
                                        id: `extra${index}`,
                                        label: `Extra ${index}`,
                                        path: `extra${index}`,
                                        type: "text" as const,
                                    }))
                                  : []),
                              { id: "notes", label: "Notes", path: "notes", type: "textarea" },
                          ])
                        : {
                              id: "service",
                              label: "Service",
                              status: "success",
                              definition: { kind: "service", management: { schemaVersion: 1 } },
                          },
            });
        } else if (path === "/.cms/sources/service/getConnection" || path === "/.cms/sources/service/saveConnection") {
            if (request.method() === "GET" && readFailure) {
                readFailure = false;
                await route.fulfill({ status: 503, json: { error: "Settings are temporarily unavailable." } });
                return;
            }
            if (request.method() === "POST") {
                const body = request.postDataJSON();
                writes.push(body);
                await pendingSave;
                if (failure) {
                    failure = false;
                    await route.fulfill({ status: 503, json: { error: "Please retry this save." } });
                    return;
                }
                if (body.expectedRevision !== settings.savedRevision) {
                    await route.fulfill({ status: 409, json: { error: "Revision conflict" } });
                    return;
                }
                settings = {
                    values: { ...settings.values, ...body.values, country: body.values.country.trim().toUpperCase() },
                    savedRevision: `v${writes.length + 1}`,
                    appliedRevision: `v${writes.length + 1}`,
                };
            }
            await route.fulfill({ json: settings });
        } else if (path === "/api/integrations/management/action") {
            actions.push(request.postDataJSON().actionId);
            settings.appliedRevision = settings.savedRevision;
            await route.fulfill({ json: { values: {} } });
        } else if (path === "/api/integrations/management/health") {
            await route.fulfill({
                json: {
                    schemaVersion: 1,
                    installationId: "service",
                    observedAt: "2026-09-07T12:00:00Z",
                    freshness: "unavailable",
                    observation: "unsupported",
                    report: null,
                },
            });
        } else {
            await route.fulfill({ json: [] });
        }
    });
    return {
        writes,
        requests,
        actions,
        holdSave() {
            let release!: () => void;
            pendingSave = new Promise<void>((resolve) => {
                release = resolve;
            });
            return () => {
                pendingSave = undefined;
                release();
            };
        },
        failRead: () => {
            readFailure = true;
        },
        failSave: () => {
            failure = true;
        },
        settings: () => settings,
    };
}
