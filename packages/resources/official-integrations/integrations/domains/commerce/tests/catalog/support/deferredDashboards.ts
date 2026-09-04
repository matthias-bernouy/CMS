import { resolve } from "node:path";
import { loadDefinitionFragment } from "../../../../../../tests/helpers/definitionFragment";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";

const integrationRoot = resolve(import.meta.dir, "../../..");
const dashboardDefinitions = [
    "products/definition.json",
    "offers/definition.json",
    "orders/root.json",
    "sellers/root.json",
    "configuration/definition.json",
    "workflow/definition.json",
    "metadata/definition.json",
    "taxonomy/definition.json",
];

export async function commerceDefinitionWithDeferredDashboards<T>(): Promise<T> {
    const definition = await loadIntegrationDefinition<{ artifacts: unknown[] }>(
        resolve(integrationRoot, "definition.json"),
    );
    const dashboards = await Promise.all(
        dashboardDefinitions.map((path) =>
            loadDefinitionFragment(resolve(integrationRoot, "definitions/artifacts/dashboards", path)),
        ),
    );
    return { ...definition, artifacts: [...definition.artifacts, ...dashboards] } as T;
}
