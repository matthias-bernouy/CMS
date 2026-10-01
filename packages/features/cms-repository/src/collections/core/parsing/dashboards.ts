import type { CollectionDashboard, CollectionDashboardNavigationItem } from "../../interfaces/CollectionDashboard";
import { invalid } from "../errors";
import { array, identifier, keys, record, string, unique } from "../values";

export function parseCollectionDashboards(
    value: unknown,
    viewIds: ReadonlySet<string>,
): readonly CollectionDashboard[] {
    const dashboards = array(value, 32, "$.dashboards").map((entry, index) => {
        const path = `$.dashboards[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "name", "icon", "description", "views", "navigation", "contracts"], path);
        const views = (source.views === undefined ? [] : array(source.views, 16, `${path}.views`)).map(
            (item, viewIndex) => {
                const itemPath = `${path}.views[${viewIndex}]`;
                const definition = record(item, itemPath);
                keys(definition, ["viewId", "label"], itemPath);
                const viewId = identifier(definition.viewId, `${itemPath}.viewId`);
                if (!viewIds.has(viewId)) {
                    invalid("dashboard view must belong to this collection", `${itemPath}.viewId`);
                }
                return { viewId, label: string(definition.label, 120, `${itemPath}.label`) };
            },
        );
        const navigation =
            source.navigation === undefined
                ? undefined
                : parseNavigation(source.navigation, viewIds, `${path}.navigation`);
        if (views.length === 0 && !navigation?.length) {
            invalid("dashboard needs at least one view", path);
        }
        if (views.length && navigation) {
            invalid("use either views or navigation", path);
        }
        unique(
            views.map((view) => view.viewId),
            `${path}.views`,
        );
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
            ...(views.length ? { views } : {}),
            ...(navigation ? { navigation } : {}),
            ...(contracts ? { contracts } : {}),
        };
    });
    unique(
        dashboards.map((dashboard) => dashboard.id),
        "$.dashboards",
    );
    return dashboards.sort((a, b) => a.id.localeCompare(b.id));
}

function parseNavigation(
    value: unknown,
    viewIds: ReadonlySet<string>,
    path: string,
): CollectionDashboardNavigationItem[] {
    const used = new Set<string>();
    let count = 0;
    const parse = (entries: unknown, level: number, at: string): CollectionDashboardNavigationItem[] => {
        const ids = new Set<string>();
        return array(entries, 16, at).map((entry, index) => {
            const itemPath = `${at}[${index}]`;
            const item = record(entry, itemPath);
            keys(item, ["id", "label", "icon", "use", "childPlacement", "children"], itemPath);
            if (++count > 64 || level > 3) {
                invalid("navigation exceeds three levels or 64 items", itemPath);
            }
            const id = identifier(item.id, `${itemPath}.id`);
            if (ids.has(id)) {
                invalid("duplicate navigation ID", `${itemPath}.id`);
            }
            ids.add(id);
            const use = item.use === undefined ? undefined : identifier(item.use, `${itemPath}.use`);
            if (use && (!viewIds.has(use) || used.has(use))) {
                invalid("navigation view must exist and be used once", `${itemPath}.use`);
            }
            if (use) {
                used.add(use);
            }
            const children = item.children === undefined ? [] : parse(item.children, level + 1, `${itemPath}.children`);
            if (!use && !children.length) {
                invalid("navigation group needs children", itemPath);
            }
            const placement = item.childPlacement;
            if (
                children.length &&
                ((placement !== "lateral" && placement !== "tabs") || (level === 2 && placement !== "tabs"))
            ) {
                invalid("invalid child placement", `${itemPath}.childPlacement`);
            }
            if (!children.length && placement !== undefined) {
                invalid("child placement requires children", `${itemPath}.childPlacement`);
            }
            return {
                id,
                label: string(item.label, 32, `${itemPath}.label`),
                ...(item.icon === undefined ? {} : { icon: identifier(item.icon, `${itemPath}.icon`) }),
                ...(use ? { use } : {}),
                ...(children.length ? { childPlacement: placement as "lateral" | "tabs", children } : {}),
            };
        });
    };
    return parse(value, 1, path);
}
