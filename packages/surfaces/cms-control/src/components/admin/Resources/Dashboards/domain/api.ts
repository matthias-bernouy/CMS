import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { AvailableView, Dashboard, ExploreDashboard, User } from "./types";

const base = () => `${getMetaBasePath()}/api`;

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

export async function postDashboard(path: string, body: unknown): Promise<Dashboard | { members: string[] }> {
    const response = await fetch(`${base()}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
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

export async function deletePrivateDashboard(id: string, revision: number): Promise<void> {
    const response = await fetch(`${base()}/dashboard`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, revision }),
    });
    if (!response.ok) {
        throw new Error(`Dashboard deletion failed (${response.status}): ${await response.text()}`);
    }
}
