import type { Page } from "playwright";
import type { IntegrationHealthEnvelope } from "@bernouy/cms-integrations";
import { installConnectionRoutes } from "../connection/fixture";

export const healthPage = "http://cms.test/admin/health?integration=service";
export function initialHealth(): IntegrationHealthEnvelope {
    return {
        schemaVersion: 1,
        installationId: "service",
        observedAt: "2026-09-07T12:00:00Z",
        freshness: "stale",
        observation: "unreachable",
        reason: "forbidden",
        httpStatus: 403,
        reportDefinitionVersion: "1.0.0",
        report: {
            schemaVersion: 1,
            status: "degraded",
            checkedAt: "2026-09-07T11:00:00Z",
            configuration: { savedRevision: "v2", appliedRevision: "v1" },
            checks: [
                {
                    id: "hooks",
                    status: "warning",
                    message: "Webhooks need updating",
                    actionIds: ["repair", "unknown"],
                },
                { id: "connection", status: "ok", code: "connected" },
            ],
            operation: { id: "apply-2", status: "running", steps: [{ id: "hooks", status: "pending" }] },
        },
    };
}
export async function installHealthRoutes(page: Page, bundle: string, styles: string) {
    const connection = await installConnectionRoutes(page, bundle, styles);
    await page.route("http://cms.test/admin/health?*", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script src="/control.js"></script></head><body><cms-binding-core><w13c-fixed-admin-layout><cms-health-operations installation-id="service"></cms-health-operations></w13c-fixed-admin-layout></cms-binding-core></body>',
        }),
    );
    const state = {
        health: initialHealth() as IntegrationHealthEnvelope | null,
        reads: [] as string[],
        actions: [] as string[],
    };
    let readGate: Promise<void> | undefined;
    let actionGate: Promise<void> | undefined;
    let failRead = false;
    let failAction = false;
    await page.route("**/api/integrations/installations?*", (route) =>
        route.fulfill({
            json: {
                id: "service",
                label: "Service",
                integrationType: "source",
                status: "success",
                definition: {
                    kind: "service",
                    label: "Service",
                    inputs: [],
                    management: {
                        schemaVersion: 1,
                        health: { functionId: "health" },
                        actions: [{ id: "repair", label: "Repair connection", functionId: "repair" }],
                    },
                },
            },
        }),
    );
    await page.route("**/api/integrations/management/health?*", async (route) => {
        state.reads.push(route.request().url());
        const response = structuredClone(state.health);
        const failed = failRead;
        failRead = false;
        await readGate;
        await route.fulfill(
            failed ? { status: 503, json: { error: "Health temporarily unavailable" } } : { json: response },
        );
    });
    await page.route("**/api/integrations/management/action?*", async (route) => {
        state.actions.push(route.request().postDataJSON().actionId);
        const failed = failAction;
        failAction = false;
        await actionGate;
        if (failed) {
            await route.fulfill({ status: 503, json: { error: "Repair temporarily unavailable" } });
            return;
        }
        if (state.health?.report) {
            state.health.freshness = "fresh";
            state.health.observation = "valid";
            state.health.report.configuration.appliedRevision = "v2";
            state.health.report.checks[0]!.status = "ok";
        }
        await route.fulfill({ json: { values: {} } });
    });
    return {
        ...state,
        get health() {
            return state.health;
        },
        connection,
        setHealth(value: IntegrationHealthEnvelope | null) {
            state.health = value;
        },
        holdRead() {
            let release!: () => void;
            readGate = new Promise<void>((resolve) => {
                release = resolve;
            });
            return () => {
                readGate = undefined;
                release();
            };
        },
        holdAction() {
            let release!: () => void;
            actionGate = new Promise<void>((resolve) => {
                release = resolve;
            });
            return () => {
                actionGate = undefined;
                release();
            };
        },
        failRead() {
            failRead = true;
        },
        failAction() {
            failAction = true;
        },
    };
}
