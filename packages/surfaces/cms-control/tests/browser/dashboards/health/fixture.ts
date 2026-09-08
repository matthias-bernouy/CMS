import type { Page } from "playwright";
import { mountShell } from "../workspace/detail-shell/fixture";
import { connectionGroups } from "./connectionView";

export const management = {
    schemaVersion: 1,
    health: { functionId: "health" },
    actions: [
        {
            id: "repair",
            label: "Repair",
            functionId: "repair",
            fields: [{ id: "reason", path: "reason", type: "text", label: "Reason", required: true }],
        },
    ],
};
export const installation = {
    id: "service",
    label: "Service",
    definitionVersion: "1.0.0",
    status: "success",
    statusLabel: "Active",
    sourceIds: ["service"],
    artifacts: [{ type: "source", id: "service" }],
    definitionSnapshot: { type: "source", management },
    definition: { management },
    runs: [{ runNumber: 1, statusLabel: "Active", startedAtLabel: "Today" }],
    management,
};
export const health = {
    schemaVersion: 1,
    installationId: "service",
    freshness: "fresh",
    observation: "valid",
    observedAt: "2026-09-08T00:00:00Z",
    report: {
        schemaVersion: 1,
        status: "degraded",
        checkedAt: "2026-09-08T00:00:00Z",
        configuration: { savedRevision: "r1", appliedRevision: "r0" },
        checks: [
            {
                id: "connection",
                status: "warning",
                message: "Configuration needs applying",
                actionIds: ["repair"],
            },
        ],
    },
};

export async function mountHealthFixture(page: Page, content: string, healthDelay = 0) {
    const groups = connectionGroups([
        { id: "country", path: "market.country", label: "Country", type: "text", required: true },
        { id: "key", path: "apiKey", label: "API key", type: "secret-ref" },
    ]);
    const state = {
        settingsReads: 0,
        definitionsReads: 0,
        healthReads: 0,
        writes: [] as { path: string; body: any }[],
        revision: "r1",
        country: "FR",
        saveStatus: 200,
        readStatus: 200,
        saveDelay: 0,
        readDelay: 0,
        healthDelay,
    };
    const errors = await mountShell(page, content, async (route, url) => {
        const method = route.request().method();
        if (url.pathname === "/api/dashboards") {
            state.definitionsReads++;
            await route.fulfill({ json: groups });
        } else if (url.pathname.endsWith("/installations")) {
            await route.fulfill({
                json: url.searchParams.has("id")
                    ? installation
                    : [installation, { ...installation, id: "slow", label: "Slow service" }],
            });
        } else if (url.pathname.endsWith("/getConnection") || url.pathname.endsWith("/saveConnection")) {
            if (method === "POST") {
                const body = route.request().postDataJSON();
                state.writes.push({ path: url.pathname, body });
                await new Promise((resolve) => setTimeout(resolve, state.saveDelay));
                if (state.saveStatus === 200) {
                    state.country = body.values.market.country;
                    state.revision = state.revision === "r1" ? "r2" : "r3";
                }
                await route.fulfill({ status: state.saveStatus, json: { error: "Save rejected" } });
            } else {
                state.settingsReads++;
                await new Promise((resolve) => setTimeout(resolve, state.readDelay));
                await route.fulfill({
                    status: state.readStatus,
                    json: {
                        values: { market: { country: state.country }, apiKey: "${TEST_KEY}" },
                        savedRevision: state.revision,
                        appliedRevision: state.revision,
                    },
                });
            }
        } else if (url.pathname.endsWith("/health")) {
            state.healthReads++;
            if (url.searchParams.get("id") === "slow") {
                await new Promise((resolve) => setTimeout(resolve, state.healthDelay));
            }
            await route.fulfill({ json: health });
        } else if (url.pathname.endsWith("/versions")) {
            await route.fulfill({ json: { current: "1.0.0", versions: ["1.1.0"], stable: "1.1.0" } });
        } else if (method === "POST") {
            state.writes.push({ path: url.pathname, body: route.request().postDataJSON() });
            await route.fulfill({ json: {} });
        } else {
            await route.fulfill({ json: [] });
        }
    });
    return { state, errors };
}
