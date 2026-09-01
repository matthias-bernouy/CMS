import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { GENERATED_INTEGRATION_INSTALLATIONS_FILE, SITE_INTEGRATIONS_DIR } from "../integrations";
import {
    DuplicateIntegrationInstallationError,
    type IntegrationInstallation,
    type IntegrationInstallationCreate,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";

const MAX_RUNS = 20;

export class LocalFsIntegrationInstallationRepository implements IntegrationInstallationRepository {
    private readonly file: string;
    private readonly importsDir: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, GENERATED_INTEGRATION_INSTALLATIONS_FILE);
        this.importsDir = join(siteDir, SITE_INTEGRATIONS_DIR);
    }

    async list(): Promise<IntegrationInstallation[]> {
        return (await this.readAll())
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
            .map(copyInstallation);
    }

    async get(id: string): Promise<IntegrationInstallation | null> {
        const found = (await this.readAll()).find((installation) => installation.id === id);
        return found ? copyInstallation(found) : null;
    }

    async create(input: IntegrationInstallationCreate): Promise<IntegrationInstallation> {
        const installations = await this.readAll();
        if (installations.some((installation) => installation.id === input.id)) {
            throw new DuplicateIntegrationInstallationError(input.id);
        }
        const now = new Date();
        const installation: IntegrationInstallation = {
            ...input,
            status: input.status ?? "pending",
            createdAt: now,
            updatedAt: now,
            runCount: input.runs?.length ?? 0,
            artifacts: input.artifacts ?? [],
            runs: trimRuns(input.runs ?? []),
        };
        installations.push(installation);
        await this.writeAll(installations);
        await this.writeImport(installation);
        return copyInstallation(installation);
    }

    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        const installations = await this.readAll();
        const next = {
            ...installation,
            createdAt: new Date(installation.createdAt),
            updatedAt: new Date(installation.updatedAt),
            runs: trimRuns(installation.runs),
        };
        const index = installations.findIndex((candidate) => candidate.id === installation.id);
        if (index >= 0) {
            installations[index] = next;
        } else {
            installations.push(next);
        }
        await this.writeAll(installations);
        await this.writeImport(next);
        return copyInstallation(next);
    }

    private async readAll(): Promise<IntegrationInstallation[]> {
        if (!existsSync(this.file)) {
            return [];
        }
        const parsed = JSON.parse(await readFile(this.file, "utf-8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map(reviveInstallation)
            .filter((installation): installation is IntegrationInstallation => installation !== null);
    }

    private async writeAll(installations: IntegrationInstallation[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, `${JSON.stringify(installations, null, 4)}\n`, "utf-8");
    }

    private async writeImport(installation: IntegrationInstallation): Promise<void> {
        await mkdir(this.importsDir, { recursive: true });
        const repositoryManaged = installation.packageDigest !== undefined;
        await writeFile(
            join(this.importsDir, `${slug(installation.id)}.json`),
            `${JSON.stringify(
                {
                    kind: installation.id,
                    ...(repositoryManaged ? { version: installation.definitionVersion } : {}),
                    ...(!repositoryManaged && installation.definitionSnapshot
                        ? { definition: installation.definitionSnapshot }
                        : {}),
                    answers: installation.answersSnapshot ?? {},
                },
                null,
                4,
            )}\n`,
            "utf-8",
        );
    }
}

function reviveInstallation(value: unknown): IntegrationInstallation | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const record = value as IntegrationInstallation;
    if (typeof record.id !== "string") {
        return null;
    }
    return {
        ...record,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
        runs: (record.runs ?? []).map((run) => ({
            ...run,
            startedAt: new Date(run.startedAt),
            finishedAt: new Date(run.finishedAt),
        })),
    };
}

function trimRuns<T>(runs: T[]): T[] {
    return runs.slice(Math.max(0, runs.length - MAX_RUNS));
}

function copyInstallation(installation: IntegrationInstallation): IntegrationInstallation {
    return structuredClone(installation);
}

function slug(value: string): string {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "integration"
    );
}
