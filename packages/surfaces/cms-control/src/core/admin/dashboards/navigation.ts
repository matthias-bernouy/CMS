import type { DashboardMount, DashboardNavigationItem } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import { availableDashboardViews } from "./model";

const ID = /^[a-z][a-z0-9-]{0,63}$/;
const ICON = /^[a-z][a-z0-9-]{0,31}$/;

export async function parseDashboardNavigation(cms: ControlCms, value: unknown): Promise<DashboardNavigationItem[]> {
    const available = new Set(
        (await availableDashboardViews(cms)).map((view) => `${view.collectionId}:${view.viewId}`),
    );
    const used = new Set<string>();
    const budget = { count: 0 };
    return parseItems(value, 1, available, used, budget);
}

function parseItems(
    value: unknown,
    depth: number,
    available: ReadonlySet<string>,
    used: Set<string>,
    budget: { count: number },
): DashboardNavigationItem[] {
    if (!Array.isArray(value) || value.length > 16) {
        throw new TypeError("Navigation must contain at most sixteen items per level");
    }
    const ids = new Set<string>();
    return value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) || ++budget.count > 64) {
            throw new TypeError("Invalid dashboard navigation item");
        }
        const item = entry as Record<string, unknown>;
        if (
            Object.keys(item).some((key) => !["id", "label", "icon", "use", "childPlacement", "children"].includes(key))
        ) {
            throw new TypeError("Unknown dashboard navigation property");
        }
        if (typeof item.id !== "string" || !ID.test(item.id) || ids.has(item.id)) {
            throw new TypeError("Navigation item IDs must be unique within their level");
        }
        ids.add(item.id);
        if (typeof item.label !== "string" || !item.label.trim() || item.label.length > 32) {
            throw new TypeError("Navigation labels must be between one and 32 characters");
        }
        if (item.icon !== undefined && (typeof item.icon !== "string" || !ICON.test(item.icon))) {
            throw new TypeError("Invalid navigation icon");
        }
        if (
            item.use !== undefined &&
            (typeof item.use !== "string" || !available.has(item.use) || used.has(item.use))
        ) {
            throw new TypeError("Navigation view must be installed and used only once");
        }
        if (typeof item.use === "string") {
            used.add(item.use);
        }
        const children =
            item.children === undefined ? [] : parseItems(item.children, depth + 1, available, used, budget);
        if (!item.use && children.length === 0) {
            throw new TypeError("A navigation group needs children");
        }
        if (children.length > 0) {
            if (depth >= 3 || (item.childPlacement !== "lateral" && item.childPlacement !== "tabs")) {
                throw new TypeError("Navigation children require a supported placement and depth");
            }
            if (depth === 2 && item.childPlacement !== "tabs") {
                throw new TypeError("Secondary navigation can only contain tabs");
            }
        } else if (item.childPlacement !== undefined) {
            throw new TypeError("Navigation placement requires children");
        }
        return {
            id: item.id,
            label: item.label.trim(),
            ...(item.icon === undefined ? {} : { icon: item.icon }),
            ...(item.use === undefined ? {} : { use: item.use }),
            ...(children.length === 0 ? {} : { childPlacement: item.childPlacement as "lateral" | "tabs", children }),
        };
    });
}

export function navigationMounts(items: readonly DashboardNavigationItem[]): DashboardMount[] {
    return items.flatMap((item) => [
        ...(item.use
            ? [{ collectionId: item.use.split(":")[0]!, viewId: item.use.split(":")[1]!, label: item.label }]
            : []),
        ...navigationMounts(item.children ?? []),
    ]);
}

export function recordNavigation(record: {
    navigation?: readonly DashboardNavigationItem[];
    mounts?: readonly DashboardMount[];
}): DashboardNavigationItem[] {
    return record.navigation
        ? [...structuredClone(record.navigation)]
        : (record.mounts ?? []).map((mount, index) => ({
              id: `view-${index + 1}`,
              label: mount.label,
              use: `${mount.collectionId}:${mount.viewId}`,
          }));
}
