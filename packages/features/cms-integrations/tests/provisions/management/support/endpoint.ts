import { executeIntegrationEndpoint, type IntegrationManagementDeps } from "@bernouy/cms-integrations";
import type { DashboardField } from "@bernouy/cms-dashboards";
import { sourceDtoToSource } from "@bernouy/cms-sources";
import { fixture, definition, report } from "./fixture";
export async function endpointFixture(
    handler: (body: Record<string, any>) => unknown | Promise<unknown>,
    extra: Partial<IntegrationManagementDeps> = {},
) {
    const context = await fixture(async () => report(), extra);
    const artifact = definition.artifacts!.find((artifact) => artifact.type === "source")!;
    if (artifact.type !== "source") {
        throw new Error("Missing source");
    }
    const endpoint = sourceDtoToSource(artifact.source).endpoints[0]!;
    return {
        ...context,
        async write(values: Record<string, unknown> = {}, actor = { id: "admin", role: "admin" }) {
            const response = await executeIntegrationEndpoint(
                context.deps,
                endpoint,
                new Request("https://control.test/source", { method: "POST", body: JSON.stringify(values) }),
                async (request) => {
                    const result = await handler(await request.json());
                    return result instanceof Response ? result : Response.json(result);
                },
                actor,
            );
            return { status: response.status, body: await response.json() };
        },
        async fields(fields: DashboardField[], valuesPath?: string) {
            const installation = (await context.installations.get(definition.kind))!;
            const artifact = installation.definitionSnapshot!.artifacts!.find(
                (artifact) => artifact.type === "dashboard-view",
            )!;
            if (artifact.type !== "dashboard-view") {
                throw new Error("Missing view");
            }
            const detail = artifact.view.view.widgets[0]!;
            if (detail.widget !== "w-detail") {
                throw new Error("Missing detail");
            }
            detail.main = [{ id: "connection", title: "Connection", fields }];
            detail.save!.valuesPath = valuesPath;
            await context.installations.replace(installation);
        },
    };
}
