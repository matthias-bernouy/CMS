import type { DashboardViewMount } from "@bernouy/cms-dashboards";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const VIEW_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9])?$/;
const MOUNT_KEYS = new Set(["id", "label", "icon", "use", "children"]);
const INPUT_KEYS = new Set(["id", "name", "icon", "homeView", "views"]);
export const DASHBOARD_NAME_MAX_LENGTH = 16;
export const DASHBOARD_NAVIGATION_LABEL_MAX_LENGTH = 16;

export type DashboardInput = {
    id: string;
    name: string;
    icon: string;
    homeView: string;
    views: DashboardViewMount[];
};

export function parseDashboardInput(payload: Record<string, unknown>): DashboardInput {
    const unknown = Object.keys(payload).find((key) => !INPUT_KEYS.has(key));
    if (unknown) {
        throw new InvalidParam(unknown, "is not supported.");
    }
    const name = requiredText(payload.name, "name", DASHBOARD_NAME_MAX_LENGTH);
    const icon = payload.icon === undefined ? "layout" : requiredText(payload.icon, "icon", 100);
    const id = payload.id === undefined ? slug(name) : requiredId(payload.id, "id");
    const rawViews = parseViewsValue(payload.views);
    if (rawViews !== undefined && !Array.isArray(rawViews)) {
        throw new InvalidParam("views", "must be an array.");
    }
    const counter = { value: 0 };
    const views = (rawViews ?? []).map((view, index) => parseMount(view, `views.${index}`, 1, counter));
    if (counter.value > 100) {
        throw new InvalidParam("views", "cannot contain more than 100 navigation entries.");
    }
    if (views.length === 0 && payload.homeView !== undefined && payload.homeView !== "") {
        throw new InvalidParam("homeView", "must be empty when the dashboard has no views.");
    }
    const homeView = views.length
        ? payload.homeView === undefined
            ? firstLeafPath(views)
            : requiredText(payload.homeView, "homeView", 256)
        : "";
    return { id, name, icon, homeView, views };
}

function parseViewsValue(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        throw new InvalidParam("views", "must be an array or contain a valid JSON array.");
    }
}

export function requiredId(value: unknown, name: string): string {
    const id = requiredText(value, name, 64);
    if (!ID.test(id)) {
        throw new InvalidParam(name, "must be a lowercase slug using letters, numbers, and hyphens.");
    }
    return id;
}

function requiredViewId(value: unknown, name: string): string {
    const id = requiredText(value, name, 128);
    if (!VIEW_ID.test(id) || id.includes("..") || id.includes("//")) {
        throw new InvalidParam(name, "must be a safe view identifier.");
    }
    return id;
}

export function requiredText(value: unknown, name: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > max) {
        throw new InvalidParam(name, `must be a non-empty string of at most ${max} characters.`);
    }
    return value.trim();
}

function parseMount(value: unknown, path: string, depth: number, counter: { value: number }): DashboardViewMount {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidParam(path, "must be an object.");
    }
    if (depth > 3) {
        throw new InvalidParam(path, "cannot exceed three navigation levels.");
    }
    const record = value as Record<string, unknown>;
    const unknown = Object.keys(record).find((key) => !MOUNT_KEYS.has(key));
    if (unknown) {
        throw new InvalidParam(`${path}.${unknown}`, "is not supported.");
    }
    counter.value += 1;
    if (record.children !== undefined && !Array.isArray(record.children)) {
        throw new InvalidParam(`${path}.children`, "must be an array.");
    }
    const children = record.children?.map((child, index) =>
        parseMount(child, `${path}.children.${index}`, depth + 1, counter),
    );
    const use = record.use === undefined ? undefined : requiredViewId(record.use, `${path}.use`);
    return {
        id: requiredId(record.id, `${path}.id`),
        ...(record.label === undefined
            ? {}
            : {
                  label: requiredText(record.label, `${path}.label`, DASHBOARD_NAVIGATION_LABEL_MAX_LENGTH),
              }),
        ...(record.icon === undefined ? {} : { icon: requiredText(record.icon, `${path}.icon`, 100) }),
        ...(use ? { use } : {}),
        ...(children ? { children } : {}),
    };
}

function firstLeafPath(views: DashboardViewMount[], parent = ""): string {
    const first = views[0]!;
    const path = parent ? `${parent}/${first.id}` : first.id;
    return first.use || !first.children?.length ? path : firstLeafPath(first.children, path);
}

function slug(value: string): string {
    const id = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64)
        .replace(/-$/g, "");
    if (!id) {
        throw new InvalidParam("name", "must produce a valid dashboard id.");
    }
    return id;
}
