import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { GENERATED_INTEGRATION_INSTANCES_FILE, SITE_INTEGRATIONS_DIR } from "./integrations";
import {
    DuplicateIntegrationInstanceError,
    type IntegrationInstance,
    type IntegrationInstanceCreate,
    type IntegrationInstanceRepository,
} from "@bernouy/cms-integrations";

const MAX_RUNS = 20;

export class LocalFsIntegrationInstanceRepository implements IntegrationInstanceRepository {
    private readonly file: string;
    private readonly importsDir: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_INTEGRATION_INSTANCES_FILE);
        this.importsDir = join(siteDir, SITE_INTEGRATIONS_DIR);
    }

    async list(): Promise<IntegrationInstance[]> {
        return (await this.readAll())
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
            .map(copyInstance);
    }

    async get(id: string): Promise<IntegrationInstance | null> {
        const found = (await this.readAll()).find(instance => instance.id === id);
        return found ? copyInstance(found) : null;
    }

    async create(input: IntegrationInstanceCreate): Promise<IntegrationInstance> {
        const instances = await this.readAll();
        if (instances.some(instance => instance.id === input.id)) {
            throw new DuplicateIntegrationInstanceError(input.id);
        }
        const now = new Date();
        const instance: IntegrationInstance = {
            ...input,
            status: input.status ?? "pending",
            createdAt: now,
            updatedAt: now,
            runCount: input.runs?.length ?? 0,
            artifacts: input.artifacts ?? [],
            runs: trimRuns(input.runs ?? []),
        };
        instances.push(instance);
        await this.writeAll(instances);
        await this.writeImport(instance);
        return copyInstance(instance);
    }

    async replace(instance: IntegrationInstance): Promise<IntegrationInstance> {
        const instances = await this.readAll();
        const next = {
            ...instance,
            createdAt: new Date(instance.createdAt),
            updatedAt: new Date(instance.updatedAt),
            runs: trimRuns(instance.runs),
        };
        const index = instances.findIndex(candidate => candidate.id === instance.id);
        if (index >= 0) instances[index] = next;
        else instances.push(next);
        await this.writeAll(instances);
        await this.writeImport(next);
        return copyInstance(next);
    }

    private async readAll(): Promise<IntegrationInstance[]> {
        if (!existsSync(this.file)) return [];
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.map(reviveInstance).filter((instance): instance is IntegrationInstance => instance !== null);
    }

    private async writeAll(instances: IntegrationInstance[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, `${JSON.stringify(instances, null, 4)}\n`, "utf-8");
    }

    private async writeImport(instance: IntegrationInstance): Promise<void> {
        await mkdir(this.importsDir, { recursive: true });
        await writeFile(join(this.importsDir, `${slug(instance.id)}.json`), `${JSON.stringify({
            kind: instance.kind,
            ...(instance.definitionSnapshot ? { definition: instance.definitionSnapshot } : {}),
            answers: instance.answersSnapshot ?? {},
            instance: {
                id: instance.id,
                label: instance.label,
            },
        }, null, 4)}\n`, "utf-8");
    }
}

function reviveInstance(value: unknown): IntegrationInstance | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as IntegrationInstance;
    if (typeof record.id !== "string" || typeof record.kind !== "string") return null;
    return {
        ...record,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
        runs: (record.runs ?? []).map(run => ({
            ...run,
            startedAt: new Date(run.startedAt),
            finishedAt: new Date(run.finishedAt),
        })),
    };
}

function trimRuns<T>(runs: T[]): T[] {
    return runs.slice(Math.max(0, runs.length - MAX_RUNS));
}

function copyInstance(instance: IntegrationInstance): IntegrationInstance {
    return structuredClone(instance);
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "integration";
}
