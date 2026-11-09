import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UlviaPaths } from "../../paths";
import { parseInstallationConfig, type InstallationConfig } from "../installation";
import { isOfficialImage, type OfficialImage } from "./images";

const SERVICES_SCHEMA = "ulvia.local-services-stack.v1" as const;

export type LocalServicesState = Readonly<{
    schema: typeof SERVICES_SCHEMA;
    projectName: string;
    privateNetwork: string;
    instanceNetwork: string;
    images: Readonly<{ provider: OfficialImage; edge: OfficialImage }>;
    installation: InstallationConfig;
}>;

export function localServicesIdentity(paths: UlviaPaths) {
    const suffix = dataSuffix(paths);
    return {
        projectName: `ulvia-services-${suffix}`,
        privateNetwork: `ulvia-services-private-${suffix}`,
        instanceNetwork: `ulvia-instances-${suffix}`,
    } as const;
}

export async function loadLocalServicesState(paths: UlviaPaths): Promise<LocalServicesState | null> {
    const value = await readState(join(paths.services, "stack.json"));
    if (value === null) {
        return null;
    }
    const identity = localServicesIdentity(paths);
    if (
        value.schema !== SERVICES_SCHEMA ||
        value.projectName !== identity.projectName ||
        value.privateNetwork !== identity.privateNetwork ||
        value.instanceNetwork !== identity.instanceNetwork ||
        !validServiceImages(value.images)
    ) {
        throw new Error("Ulvia local services state is invalid");
    }
    const installation = parseInstallationConfig(value.installation);
    return {
        schema: SERVICES_SCHEMA,
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
    images: LocalServicesState["images"],
): Promise<LocalServicesState> {
    const state: LocalServicesState = {
        schema: SERVICES_SCHEMA,
        ...localServicesIdentity(paths),
        images,
        installation,
    };
    await writeState(join(paths.services, "stack.json"), state);
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

function validServiceImages(value: unknown): value is LocalServicesState["images"] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).sort().join(",") === "edge,provider" &&
        isOfficialImage(record.provider, "provider") &&
        isOfficialImage(record.edge, "edge")
    );
}
