import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    DuplicateDashboardViewError,
    normalizeLegacyDashboardView,
    type Dashboard,
    type DashboardViewDefinition,
    type DashboardViewRepository,
} from "@bernouy/cms-dashboards";
import { readJsonArray, writeJsonArray } from "./jsonFile";

const VIEWS_FILE = ".p9r/generated/dashboard-views.json";
const LEGACY_FILE = ".p9r/generated/dashboards.json";

export class LocalFsDashboardViewRepository implements DashboardViewRepository {
    private readonly file: string;
    private readonly legacyFile: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, VIEWS_FILE);
        this.legacyFile = join(siteDir, LEGACY_FILE);
    }

    async createView(view: DashboardViewDefinition): Promise<DashboardViewDefinition> {
        const views = await this.readAll();
        if (views.some((candidate) => candidate.id === view.id)) {
            throw new DuplicateDashboardViewError(view.id);
        }
        views.push(structuredClone(view));
        await this.writeAll(views);
        return structuredClone(view);
    }

    async updateView(view: DashboardViewDefinition): Promise<DashboardViewDefinition | null> {
        const views = await this.readAll();
        const index = views.findIndex((candidate) => candidate.id === view.id);
        if (index < 0) {
            return null;
        }
        views[index] = structuredClone(view);
        await this.writeAll(views);
        return structuredClone(view);
    }

    async deleteView(id: string): Promise<boolean> {
        const views = await this.readAll();
        const next = views.filter((view) => view.id !== id);
        if (next.length === views.length) {
            return false;
        }
        await this.writeAll(next);
        return true;
    }

    async getView(id: string): Promise<DashboardViewDefinition | null> {
        return (await this.readAll()).find((view) => view.id === id) ?? null;
    }

    async getViewsForSource(sourceId: string): Promise<DashboardViewDefinition[]> {
        return (await this.readAll()).filter((view) => view.source === sourceId);
    }

    async getAllViews(): Promise<DashboardViewDefinition[]> {
        return await this.readAll();
    }

    private async readAll(): Promise<DashboardViewDefinition[]> {
        const values = await readJsonArray(existsSync(this.file) ? this.file : this.legacyFile);
        return values.flatMap((value) => {
            if (isView(value)) {
                return [structuredClone(value)];
            }
            return isLegacy(value) ? [normalizeLegacyDashboardView(value)] : [];
        });
    }

    private async writeAll(views: DashboardViewDefinition[]): Promise<void> {
        await writeJsonArray(this.file, views);
    }
}

function isView(value: unknown): value is DashboardViewDefinition {
    const candidate = value as Partial<DashboardViewDefinition> | null;
    return candidate?.schemaVersion === 2 && typeof candidate.id === "string" && typeof candidate.source === "string";
}

function isLegacy(value: unknown): value is Dashboard {
    const candidate = value as Partial<Dashboard> | null;
    return Boolean(
        candidate &&
            typeof candidate.id === "string" &&
            typeof candidate.source === "string" &&
            Array.isArray(candidate.views),
    );
}
