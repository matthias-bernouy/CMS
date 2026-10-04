import { parseDashboardNavigation } from "@bernouy/cms-dashboards";
import type { CollectionDashboard } from "../../interfaces/CollectionDashboard";
import { invalid } from "../errors";
import { array, identifier, integer, keys, record, string, unique } from "../values";

export function parseCollectionDashboards(
    value: unknown,
    viewIds: ReadonlySet<string>,
): readonly CollectionDashboard[] {
    const dashboards = array(value, 32, "$.dashboards").map((entry, index) => {
        const path = `$.dashboards[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "generation", "name", "icon", "description", "navigation"], path);
        let navigation;
        try {
            navigation = parseDashboardNavigation(source.navigation, viewIds);
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid dashboard navigation", `${path}.navigation`);
        }
        if (navigation.length === 0) {
            invalid("dashboard needs at least one view", path);
        }
        return {
            id: identifier(source.id, `${path}.id`),
            generation:
                source.generation === undefined
                    ? 1
                    : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${path}.generation`),
            name: string(source.name, 128, `${path}.name`),
            ...(source.icon === undefined ? {} : { icon: identifier(source.icon, `${path}.icon`) }),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, `${path}.description`) }),
            navigation,
        };
    });
    unique(
        dashboards.map((dashboard) => dashboard.id),
        "$.dashboards",
    );
    return dashboards.sort((a, b) => a.id.localeCompare(b.id));
}
