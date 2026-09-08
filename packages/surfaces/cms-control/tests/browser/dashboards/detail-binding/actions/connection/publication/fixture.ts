import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { Page } from "playwright";
import { bundle, styles } from "../../navigation/definition";

export async function mountPublication(page: Page, kind: "consent" | "stripe-connect", create = false) {
    const root = dirname(
        fileURLToPath(import.meta.resolve(`@bernouy/cms-official-integrations/integrations/${kind}/definition.json`)),
    );
    const definition = (await resolveIntegrationDefinitionFile(`${root}/definition.json`, root)) as {
        artifacts: Array<{ type: string; view?: DashboardDto; source?: { endpoints: unknown[] } }>;
    };
    const detailId = kind === "consent" ? "consentContext" : "marketplaceTerms";
    const dashboard = definition.artifacts.find((a) => a.view && JSON.stringify(a.view).includes(`"${detailId}"`))!
        .view!;
    const source = definition.artifacts.find((a) => a.type === "source")!.source!;
    const writes: Array<{ path: string; body: any }> = [];
    const errors: string[] = [];
    const state = { reads: 0, failure: false, delay: 0, revision: create ? "new" : "v1", created: !create };
    const document = {
        key: "terms",
        label: "Terms",
        consentText: "I accept the Terms",
        enabled: true,
        page: "/terms",
        position: 0,
    };
    let resource: Record<string, unknown> =
        kind === "consent"
            ? {
                  contextKey: create ? "" : "buyer_checkout",
                  enabled: !create,
                  revision: state.revision,
                  status: create ? "inactive" : "active",
                  documents: create ? [] : [document],
              }
            : {
                  documentKey: "seller_terms",
                  label: "Seller terms",
                  consentText: "I accept the seller terms",
                  page: "/terms",
                  revision: "v1",
                  status: "active",
              };
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://cms.test/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.resourceType() === "document") {
            await route.fulfill({
                contentType: "text/html",
                body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><cms-binding-core><w13c-fixed-admin-layout><cms-dashboards-admin></cms-dashboards-admin></w13c-fixed-admin-layout></cms-binding-core><script src="/control.js"></script>',
            });
        } else if (path === "/control.js") {
            await route.fulfill({ contentType: "text/javascript", body: bundle });
        } else if (path === "/style.css") {
            await route.fulfill({ contentType: "text/css", body: styles });
        } else if (path === "/api/dashboards") {
            await route.fulfill({
                json: [
                    {
                        source: {
                            id: dashboard.source,
                            name: kind,
                            urn: `urn:${dashboard.source}`,
                            dashboardCount: 1,
                            endpointCount: source.endpoints.length,
                        },
                        dashboards: [dashboard],
                        endpoints: source.endpoints,
                    },
                ],
            });
        } else if (
            (path.startsWith("/api/integrations/management/") || path.endsWith("/publishConsentPolicy")) &&
            request.method() === "POST"
        ) {
            const body = request.postDataJSON();
            writes.push({ path, body });
            if (state.delay) {
                await new Promise((resolve) => setTimeout(resolve, state.delay));
            }
            if (state.failure) {
                await route.fulfill({ status: 409, json: { error: "Revision conflict" } });
                return;
            }
            const values = kind === "consent" ? body.values : body.input;
            resource = { ...resource, ...values, revision: state.revision === "v1" ? "v2" : "v1" };
            state.revision = String(resource.revision);
            state.created = true;
            await route.fulfill({
                json: { values: resource, savedRevision: resource.revision, appliedRevision: resource.revision },
            });
        } else if (path.endsWith("/getConsentContext") || path.endsWith("/getMarketplaceTermsManagement")) {
            state.reads++;
            await route.fulfill({ json: resource });
        } else {
            await route.fulfill({ json: [] });
        }
    });
    await page.goto(
        `http://cms.test/admin/sources?source=${dashboard.source}&dashboard=${dashboard.id}&collection=${detailId}&row=${create ? "__new__" : kind === "consent" ? "buyer_checkout" : "settings"}`,
    );
    await page.locator("form[data-detail-save][cms-ready]").waitFor();
    return { writes, state, errors, document };
}
