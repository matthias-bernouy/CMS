import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalInstancePaths, UlviaPaths } from "../../paths";
import { loadInstallationConfig, parseInstallationConfig, type InstallationConfig } from "../installation";
import { LOCAL_STACK_IMAGES, LOCAL_STACK_VERSION } from "./release";

const SERVICES_SCHEMA = "ulvia.local-services-stack.v1" as const;
const INSTANCE_SCHEMA = "ulvia.local-kernel-stack.v1" as const;

export type LocalServicesState = Readonly<{
    schema: typeof SERVICES_SCHEMA;
    version: string;
    projectName: string;
    privateNetwork: string;
    instanceNetwork: string;
    images: Pick<typeof LOCAL_STACK_IMAGES, "provider" | "repository">;
    installation: InstallationConfig;
}>;

export type LocalKernelState = Readonly<{
    schema: typeof INSTANCE_SCHEMA;
    version: string;
    projectName: string;
    image: string;
    hostname: string;
}>;

export function localServicesIdentity(paths: UlviaPaths) {
    const suffix = dataSuffix(paths);
    return {
        projectName: `ulvia-services-${suffix}`,
        privateNetwork: `ulvia-services-private-${suffix}`,
        instanceNetwork: `ulvia-instances-${suffix}`,
    } as const;
}

export function localKernelProjectName(paths: UlviaPaths, name: string): string {
    return `ulvia-${name}-${dataSuffix(paths)}`;
}

export async function loadLocalServicesState(paths: UlviaPaths): Promise<LocalServicesState | null> {
    const value = await readState(join(paths.services, "stack.json"));
    if (value === null) {
        return null;
    }
    const identity = localServicesIdentity(paths);
    if (
        value.schema !== SERVICES_SCHEMA ||
        typeof value.version !== "string" ||
        value.projectName !== identity.projectName ||
        value.privateNetwork !== identity.privateNetwork ||
        value.instanceNetwork !== identity.instanceNetwork ||
        !validImages(value.images, ["provider", "repository"])
    ) {
        throw new Error("Ulvia local services state is invalid");
    }
    const installation = value.installation
        ? parseInstallationConfig(value.installation)
        : await loadInstallationConfig(paths);
    if (!installation) {
        throw new Error("Ulvia local services state has no installation configuration");
    }
    return {
        schema: SERVICES_SCHEMA,
        version: value.version as string,
        projectName: value.projectName as string,
        privateNetwork: value.privateNetwork as string,
        instanceNetwork: value.instanceNetwork as string,
        images: value.images as LocalServicesState["images"],
        installation,
    };
}

export async function saveLocalServicesState(
    paths: UlviaPaths,
    installation: InstallationConfig,
): Promise<LocalServicesState> {
    const state: LocalServicesState = {
        schema: SERVICES_SCHEMA,
        version: LOCAL_STACK_VERSION,
        ...localServicesIdentity(paths),
        images: { provider: LOCAL_STACK_IMAGES.provider, repository: LOCAL_STACK_IMAGES.repository },
        installation,
    };
    await writeState(join(paths.services, "stack.json"), state);
    return state;
}

export async function loadLocalKernelState(instance: LocalInstancePaths): Promise<LocalKernelState | null> {
    const value = await readState(join(instance.root, "stack.json"));
    if (value === null) {
        return null;
    }
    if (
        value.schema !== INSTANCE_SCHEMA ||
        typeof value.version !== "string" ||
        typeof value.projectName !== "string" ||
        typeof value.hostname !== "string" ||
        !validImage(value.image)
    ) {
        throw new Error("Ulvia local Kernel state is invalid");
    }
    return value as LocalKernelState;
}

export async function saveLocalKernelState(
    instance: LocalInstancePaths,
    projectName: string,
    hostname: string,
): Promise<LocalKernelState> {
    const state: LocalKernelState = {
        schema: INSTANCE_SCHEMA,
        version: LOCAL_STACK_VERSION,
        projectName,
        image: LOCAL_STACK_IMAGES.kernel,
        hostname,
    };
    await writeState(join(instance.root, "stack.json"), state);
    return state;
}

async function readState(path: string): Promise<Record<string, unknown> | null> {
    const source = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return null;
    }
    await chmod(path, 0o600);
    return JSON.parse(source) as Record<string, unknown>;
}

async function writeState(path: string, state: object): Promise<void> {
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await chmod(path, 0o600);
}

function dataSuffix(paths: UlviaPaths): string {
    return createHash("sha256").update(paths.data).digest("hex").slice(0, 12);
}

function validImages(value: unknown, keys: readonly string[]): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return keys.every((key) => validImage(record[key]));
}

function validImage(value: unknown): value is string {
    return typeof value === "string" && /^[a-z0-9./_-]+:[a-z0-9._-]+$/u.test(value);
}
