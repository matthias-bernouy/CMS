import { parseDashboardNavigation } from "@bernouy/cms-dashboards";
import type { CollectionDashboard } from "../../interfaces/CollectionDashboard";
import { invalid } from "../errors";
import { array, identifier, keys, record, string, unique } from "../values";

export function parseCollectionDashboards(
    value: unknown,
    viewIds: ReadonlySet<string>,
): readonly CollectionDashboard[] {
    const dashboards = array(value, 32, "$.dashboards").map((entry, index) => {
        const path = `$.dashboards[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "name", "icon", "description", "navigation", "contracts"], path);
        let navigation;
        try {
            navigation = parseDashboardNavigation(source.navigation, viewIds);
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid dashboard navigation", `${path}.navigation`);
        }
        if (navigation.length === 0) {
            invalid("dashboard needs at least one view", path);
        }
        const contracts =
            source.contracts === undefined
                ? undefined
                : array(source.contracts, 32, `${path}.contracts`).map((item, i) =>
                      identifier(item, `${path}.contracts[${i}]`),
                  );
        if (contracts) {
            unique(contracts, `${path}.contracts`);
        }
        return {
            id: identifier(source.id, `${path}.id`),
            name: string(source.name, 128, `${path}.name`),
            ...(source.icon === undefined ? {} : { icon: identifier(source.icon, `${path}.icon`) }),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, `${path}.description`) }),
            navigation,
            ...(contracts ? { contracts } : {}),
        };
    });
    unique(
        dashboards.map((dashboard) => dashboard.id),
        "$.dashboards",
    );
    return dashboards.sort((a, b) => a.id.localeCompare(b.id));
}
