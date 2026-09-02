import { join } from "node:path";
import { DuplicateDashboardError, type DashboardDefinition, type DashboardRepository } from "@bernouy/cms-dashboards";
import { readJsonArray, writeJsonArray } from "./jsonFile";

const DASHBOARDS_FILE = ".p9r/generated/site-dashboards.json";

export class LocalFsDashboardRepository implements DashboardRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, DASHBOARDS_FILE);
    }

    async createDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition> {
        const dashboards = await this.readAll();
        if (dashboards.some((candidate) => candidate.id === dashboard.id)) {
            throw new DuplicateDashboardError(dashboard.id);
        }
        dashboards.push(structuredClone(dashboard));
        await this.writeAll(dashboards);
        return structuredClone(dashboard);
    }

    async updateDashboard(dashboard: DashboardDefinition): Promise<DashboardDefinition | null> {
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

    async getDashboard(id: string): Promise<DashboardDefinition | null> {
        return (await this.readAll()).find((dashboard) => dashboard.id === id) ?? null;
    }

    async getAllDashboards(): Promise<DashboardDefinition[]> {
        return await this.readAll();
    }

    private async readAll(): Promise<DashboardDefinition[]> {
        return (await readJsonArray(this.file)).filter(isDashboard).map((dashboard) => structuredClone(dashboard));
    }

    private async writeAll(dashboards: DashboardDefinition[]): Promise<void> {
        await writeJsonArray(this.file, dashboards);
    }
}

function isDashboard(value: unknown): value is DashboardDefinition {
    const candidate = value as Partial<DashboardDefinition> | null;
    return candidate?.schemaVersion === 2 && typeof candidate.id === "string" && Array.isArray(candidate.views);
}
