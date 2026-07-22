import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DuplicateDashboardError, type Dashboard, type DashboardRepository } from "@bernouy/cms-dashboards";

const GENERATED_DASHBOARDS_FILE = ".p9r/generated/dashboards.json";

export class LocalFsDashboardRepository implements DashboardRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_DASHBOARDS_FILE);
    }

    async createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        const dashboards = await this.readAll();
        if (dashboards.some((candidate) => candidate.id === dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        dashboards.push(structuredClone(dashboard));
        await this.writeAll(dashboards);
        return structuredClone(dashboard);
    }

    async updateDashboard(dashboard: Dashboard): Promise<Dashboard | null> {
        const dashboards = await this.readAll();
        const index = dashboards.findIndex((candidate) => candidate.id === dashboard.id);
        if (index < 0) {
            return null;
        }
        dashboards[index] = structuredClone(dashboard);
        await this.writeAll(dashboards);
        return structuredClone(dashboard);
    }

    async deleteDashboard(id: string): Promise<boolean> {
        const dashboards = await this.readAll();
        const next = dashboards.filter((dashboard) => dashboard.id !== id);
        if (next.length === dashboards.length) {
            return false;
        }
        await this.writeAll(next);
        return true;
    }

    async getDashboard(id: string): Promise<Dashboard | null> {
        const found = (await this.readAll()).find((dashboard) => dashboard.id === id);
        return found ? structuredClone(found) : null;
    }

    async getDashboardsForSource(sourceId: string): Promise<Dashboard[]> {
        return (await this.readAll())
            .filter((dashboard) => dashboard.source === sourceId)
            .map((dashboard) => structuredClone(dashboard));
    }

    async getAllDashboards(): Promise<Dashboard[]> {
        return (await this.readAll()).map((dashboard) => structuredClone(dashboard));
    }

    private async readAll(): Promise<Dashboard[]> {
        if (!existsSync(this.file)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isDashboard).map((dashboard) => structuredClone(dashboard));
    }

    private async writeAll(dashboards: Dashboard[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, `${JSON.stringify(dashboards, null, 4)}\n`, "utf-8");
    }
}

function isDashboard(value: unknown): value is Dashboard {
    return (
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { source?: unknown }).source === "string" &&
        Array.isArray((value as { views?: unknown }).views)
    );
}
