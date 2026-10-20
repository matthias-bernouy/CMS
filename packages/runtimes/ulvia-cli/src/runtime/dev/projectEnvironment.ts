import { randomUUID } from "node:crypto";
import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { ensureUlviaPaths, resolveUlviaDataHome, resolveUlviaPaths, type UlviaPaths } from "../paths";
import {
    PROJECT_ENVIRONMENT_FILE,
    PROJECT_ENVIRONMENT_SCHEMA,
    readProjectEnvironment,
    writeProjectEnvironment,
    type ProjectEnvironment,
} from "./projectEnvironmentConfig";

const DIRECTORY = ".ulvia";

export type ResolvedProjectEnvironment = Readonly<{
    projectRoot: string;
    paths: UlviaPaths;
    environmentId: string;
}>;

export async function resolveCommandPaths(
    cwd: string,
    environment: Record<string, string | undefined>,
    home?: string,
): Promise<UlviaPaths> {
    if (environment.ULVIA_DATA_DIR?.trim()) {
        return resolveUlviaPaths(environment, home);
    }
    return (await resolveProjectEnvironment(cwd, environment, home)).paths;
}

export async function resolveProjectEnvironment(
    cwd: string,
    environment: Record<string, string | undefined>,
    home?: string,
): Promise<ResolvedProjectEnvironment> {
    const located = await findProjectEnvironment(cwd);
    if (!located) {
        throw new Error(`No Ulvia environment is associated with ${resolve(cwd)}. Run "ulvia dev new".`);
    }
    const dataDirectory =
        located.config.dataDirectory ??
        join(resolveUlviaDataHome(environment, home), "environments", located.config.environmentId);
    await assertEnvironmentIdentity(dataDirectory, located.config.environmentId);
    return {
        projectRoot: located.projectRoot,
        paths: resolveUlviaPaths({ ULVIA_DATA_DIR: dataDirectory }, home),
        environmentId: located.config.environmentId,
    };
}

export async function createProjectEnvironment(
    cwd: string,
    environment: Record<string, string | undefined>,
    home?: string,
    requestedDataDirectory?: string,
): Promise<ResolvedProjectEnvironment> {
    const projectRoot = resolve(cwd);
    const existing = await findProjectEnvironment(projectRoot);
    if (existing) {
        throw new Error(`An Ulvia environment is already associated with ${existing.projectRoot}`);
    }
    const environmentId = randomUUID();
    const configuredDirectory = requestedDataDirectory ?? environment.ULVIA_DATA_DIR?.trim();
    if (configuredDirectory && !isAbsolute(configuredDirectory)) {
        throw new Error("The Ulvia development data directory must be absolute");
    }
    const dataDirectory = configuredDirectory
        ? resolve(configuredDirectory)
        : join(resolveUlviaDataHome(environment, home), "environments", environmentId);
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: dataDirectory }, home);
    await createEnvironmentData(paths, environmentId);
    try {
        await writeProjectAssociation(projectRoot, {
            schema: PROJECT_ENVIRONMENT_SCHEMA,
            environmentId,
            ...(configuredDirectory ? { dataDirectory } : {}),
        });
    } catch (error) {
        await rm(paths.data, { recursive: true, force: true });
        throw error;
    }
    return { projectRoot, paths, environmentId };
}

async function createEnvironmentData(paths: UlviaPaths, environmentId: string): Promise<void> {
    const created = await mkdir(paths.data, { recursive: true, mode: 0o700 });
    if (created === undefined) {
        throw new Error(`Development data directory already exists: ${paths.data}`);
    }
    await writeProjectEnvironment(join(paths.data, PROJECT_ENVIRONMENT_FILE), {
        schema: PROJECT_ENVIRONMENT_SCHEMA,
        environmentId,
    });
    await ensureUlviaPaths(paths);
}

async function writeProjectAssociation(projectRoot: string, config: ProjectEnvironment): Promise<void> {
    const directory = join(projectRoot, DIRECTORY);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Ulvia project configuration must be a real directory: ${directory}`);
    }
    await writeFile(join(directory, ".gitignore"), "*\n", { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") {
            throw error;
        }
    });
    await writeProjectEnvironment(join(directory, PROJECT_ENVIRONMENT_FILE), config);
}

async function findProjectEnvironment(
    cwd: string,
): Promise<{ projectRoot: string; config: ProjectEnvironment } | null> {
    let directory = resolve(cwd);
    while (true) {
        const path = join(directory, DIRECTORY, PROJECT_ENVIRONMENT_FILE);
        const config = await readProjectEnvironment(path, true);
        if (config !== null) {
            return { projectRoot: directory, config };
        }
        const parent = dirname(directory);
        if (parent === directory || directory === parse(directory).root) {
            return null;
        }
        directory = parent;
    }
}

async function assertEnvironmentIdentity(dataDirectory: string, expectedId: string): Promise<void> {
    const path = join(dataDirectory, PROJECT_ENVIRONMENT_FILE);
    const config = await readProjectEnvironment(path, true);
    if (!config) {
        throw new Error(`Ulvia environment data is missing or unrecognized: ${dataDirectory}`);
    }
    if (config.environmentId !== expectedId || config.dataDirectory !== undefined) {
        throw new Error(`Ulvia project and data environment identities do not match: ${dataDirectory}`);
    }
}
