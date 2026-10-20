import { lstat, readFile, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

export const PROJECT_ENVIRONMENT_SCHEMA = "ulvia.project-environment.v1" as const;
export const PROJECT_ENVIRONMENT_FILE = "environment.json";

export type ProjectEnvironment = Readonly<{
    schema: typeof PROJECT_ENVIRONMENT_SCHEMA;
    environmentId: string;
    dataDirectory?: string;
}>;

export async function readProjectEnvironment(path: string, optional = false): Promise<ProjectEnvironment | null> {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (optional && error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (metadata === null) {
        return null;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`Ulvia environment configuration must be a regular file: ${path}`);
    }
    return parseProjectEnvironment(await readFile(path, "utf8"), path);
}

export async function writeProjectEnvironment(path: string, config: ProjectEnvironment): Promise<void> {
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function parseProjectEnvironment(source: string, path: string): ProjectEnvironment {
    let value: unknown;
    try {
        value = JSON.parse(source);
    } catch {
        throw new Error(`Ulvia environment configuration is invalid: ${path}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Ulvia environment configuration is invalid: ${path}`);
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort().join(",");
    if (
        record.schema !== PROJECT_ENVIRONMENT_SCHEMA ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
            String(record.environmentId ?? ""),
        ) ||
        (keys !== "environmentId,schema" && keys !== "dataDirectory,environmentId,schema") ||
        (record.dataDirectory !== undefined &&
            (typeof record.dataDirectory !== "string" || !isAbsolute(record.dataDirectory)))
    ) {
        throw new Error(`Ulvia environment configuration is invalid: ${path}`);
    }
    return record as ProjectEnvironment;
}
