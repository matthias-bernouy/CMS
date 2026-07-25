import { writeFile, rename, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
    DuplicateIntegrationInstallationError,
    type IntegrationInstallation,
    type IntegrationInstallationCreate,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";

export class JsonIntegrationInstallationRepository implements IntegrationInstallationRepository {
    constructor(private readonly path: string) {}

    async list(): Promise<IntegrationInstallation[]> {
        return (await this.read()).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    }

    async get(id: string): Promise<IntegrationInstallation | null> {
        return (await this.read()).find((installation) => installation.id === id) ?? null;
    }

    async create(input: IntegrationInstallationCreate): Promise<IntegrationInstallation> {
        const installations = await this.read();
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
            runs: input.runs ?? [],
        };
        await this.write([...installations, installation]);
        return structuredClone(installation);
    }

    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        const installations = await this.read();
        const next = structuredClone(installation);
        const index = installations.findIndex((candidate) => candidate.id === installation.id);
        if (index === -1) {
            installations.push(next);
        } else {
            installations[index] = next;
        }
        await this.write(installations);
        return structuredClone(next);
    }

    private async read(): Promise<IntegrationInstallation[]> {
        try {
            const values = JSON.parse(await readFile(this.path, "utf8")) as SerializedInstallation[];
            return values.map(hydrateInstallation);
        } catch (error) {
            if (isNodeError(error, "ENOENT")) {
                return [];
            }
            throw error;
        }
    }

    private async write(installations: IntegrationInstallation[]): Promise<void> {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(installations)}\n`, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, this.path);
    }
}

type SerializedInstallation = Omit<IntegrationInstallation, "createdAt" | "updatedAt" | "runs"> & {
    createdAt: string;
    updatedAt: string;
    runs: Array<
        Omit<IntegrationInstallation["runs"][number], "startedAt" | "finishedAt"> & {
            startedAt: string;
            finishedAt: string;
        }
    >;
};

function hydrateInstallation(value: SerializedInstallation): IntegrationInstallation {
    return {
        ...value,
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt),
        runs: value.runs.map((run) => ({
            ...run,
            startedAt: new Date(run.startedAt),
            finishedAt: new Date(run.finishedAt),
        })),
    };
}

function isNodeError(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
