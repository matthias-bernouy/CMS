import { sourceFormRequest } from "@bernouy/components/binding";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { AvailableView, Dashboard, ExploreDashboard, User } from "./types";

const base = () => `${getMetaBasePath()}/api`;

export type DashboardSourceId = "dashboard-create" | "dashboard-delete" | "dashboard-members" | "dashboard-save";

export function configureDashboardSources(root: ParentNode): void {
    const paths: Record<DashboardSourceId, string> = {
        "dashboard-create": "dashboards",
        "dashboard-delete": "dashboard",
        "dashboard-members": "dashboard-members",
        "dashboard-save": "dashboard",
    };
    for (const [sourceId, path] of Object.entries(paths)) {
        root.querySelector(`[cms-source-id="${sourceId}"]`)?.setAttribute("cms-source", `${base()}/${path}`);
    }
}

export async function requestDashboardSource<T>(
    root: ParentNode,
    sourceId: DashboardSourceId,
    values: Record<string, unknown>,
): Promise<T> {
    return (await sourceFormRequest(root, sourceId, values)) as T;
}

export async function loadDashboards(): Promise<
    | { mode: "admin"; dashboards: Dashboard[]; views: AvailableView[]; users: User[] }
    | { mode: "member"; dashboards: Dashboard[]; views: AvailableView[]; users: User[] }
> {
    const dashboards = await fetch(`${base()}/dashboards`, { cache: "no-store" });
    if (dashboards.status === 403) {
        const mine = await fetch(`${base()}/my-dashboards`, { cache: "no-store" });
        if (!mine.ok) {
            throw new Error(`Dashboard loading failed (${mine.status})`);
        }
        return { mode: "member", ...(await mine.json()), views: [], users: [] };
    }
    if (!dashboards.ok) {
        throw new Error(`Dashboard loading failed (${dashboards.status})`);
    }
    const users = await fetch(`${base()}/users`, { cache: "no-store" });
    if (!users.ok) {
        throw new Error(`Member loading failed (${users.status})`);
    }
    return { mode: "admin", ...(await dashboards.json()), users: await users.json() };
}

export async function loadDashboardExplore(): Promise<{
    dashboards: ExploreDashboard[];
    revision: number;
    unavailableRepositories: string[];
}> {
    const response = await fetch(`${base()}/collections/dashboard-explore`, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Dashboard catalogue failed (${response.status})`);
    }
    return response.json();
}

export async function installDashboardCollection(dashboard: ExploreDashboard, revision: number): Promise<void> {
    const response = await fetch(`${base()}/collections/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            repositoryId: dashboard.repositoryId,
            publisherId: dashboard.publisherId,
            collectionId: dashboard.collectionId,
            version: dashboard.version,
            digest: dashboard.digest,
            revision,
        }),
    });
    if (!response.ok) {
        throw new Error(`Collection installation failed (${response.status}): ${await response.text()}`);
    }
}
