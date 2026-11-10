import { createHash } from "node:crypto";
import { join } from "node:path";
import type { UlviaPaths } from "../../paths";
import { parseInstallationConfig } from "../installation";
import type { InstallationConfig } from "../installation";
import { isOfficialImage } from "./images";
import type { OfficialImage } from "./images";
import { parseStackRelease } from "../releases/model";
import type { StackRelease } from "../releases/model";
import { atomicPrivateWrite, readPrivateFile } from "./deployment/storage";

export type LocalServicesState = Readonly<{
    id: string;
    projectName: string;
    privateNetwork: string;
    instanceNetwork: string;
    images: Readonly<{ provider: OfficialImage; edge: OfficialImage }>;
    installation: InstallationConfig;
    release: StackRelease;
    artifactDigest: string;
}>;
export type DeploymentOperation = Readonly<{
    kind: "apply" | "upgrade";
    phase: "prepared" | "provider" | "edges" | "proxy" | "failed";
    target: LocalServicesState;
}>;
export type DeploymentState = Readonly<{
    schema: "ulvia.local-services-stack.v1";
    applied: LocalServicesState | null;
    operation: DeploymentOperation | null;
}>;

export function localServicesIdentity(paths: UlviaPaths) {
    const suffix = createHash("sha256").update(paths.data).digest("hex").slice(0, 12);
    return {
        projectName: `ulvia-services-${suffix}`,
        privateNetwork: `ulvia-services-private-${suffix}`,
        instanceNetwork: `ulvia-instances-${suffix}`,
    } as const;
}

export async function readDeploymentState(paths: UlviaPaths): Promise<DeploymentState | null> {
    const text = await readPrivateFile(join(paths.services, "stack.json")).catch(() => {
        throw new Error("Ulvia local services state is invalid; explicit recovery is required");
    });
    if (text === null) {
        return null;
    }
    try {
        const value = JSON.parse(text);
        if (
            !value ||
            Object.keys(value).sort().join(",") !== "applied,operation,schema" ||
            value.schema !== "ulvia.local-services-stack.v1" ||
            (value.applied === null && value.operation === null)
        ) {
            throw new Error();
        }
        const applied = value.applied === null ? null : parseDeployment(paths, value.applied);
        let operation: DeploymentOperation | null = null;
        if (value.operation !== null) {
            const row = value.operation;
            if (
                !row ||
                Object.keys(row).sort().join(",") !== "kind,phase,target" ||
                !["apply", "upgrade"].includes(row.kind) ||
                !["prepared", "provider", "edges", "proxy", "failed"].includes(row.phase)
            ) {
                throw new Error();
            }
            operation = { kind: row.kind, phase: row.phase, target: parseDeployment(paths, row.target) };
        }
        return { schema: value.schema, applied, operation };
    } catch {
        throw new Error("Ulvia local services state is invalid; explicit recovery is required");
    }
}

export async function loadLocalServicesState(paths: UlviaPaths): Promise<LocalServicesState | null> {
    return (await readDeploymentState(paths))?.applied ?? null;
}
export async function saveDeploymentState(
    paths: UlviaPaths,
    applied: LocalServicesState | null,
    operation: DeploymentOperation | null,
): Promise<void> {
    if (!applied && !operation) {
        throw new Error("Empty deployment state cannot be persisted");
    }
    const value: DeploymentState = { schema: "ulvia.local-services-stack.v1", applied, operation };
    await atomicPrivateWrite(join(paths.services, "stack.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function parseDeployment(paths: UlviaPaths, value: unknown): LocalServicesState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error();
    }
    const row = value as Record<string, unknown>;
    if (
        Object.keys(row).sort().join(",") !==
            "artifactDigest,id,images,installation,instanceNetwork,privateNetwork,projectName,release" ||
        typeof row.id !== "string" ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(row.id) ||
        typeof row.artifactDigest !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(row.artifactDigest)
    ) {
        throw new Error();
    }
    const identity = localServicesIdentity(paths);
    if (
        row.projectName !== identity.projectName ||
        row.privateNetwork !== identity.privateNetwork ||
        row.instanceNetwork !== identity.instanceNetwork
    ) {
        throw new Error();
    }
    const images = row.images as LocalServicesState["images"];
    if (
        !images ||
        Object.keys(images).sort().join(",") !== "edge,provider" ||
        !isOfficialImage(images.provider, "provider") ||
        !isOfficialImage(images.edge, "edge")
    ) {
        throw new Error();
    }
    const release = parseStackRelease(row.release);
    if (images.provider.version !== release.version || images.edge.version !== release.version) {
        throw new Error();
    }
    return {
        id: row.id,
        artifactDigest: row.artifactDigest,
        ...identity,
        images,
        release,
        installation: parseInstallationConfig(row.installation),
    };
}
