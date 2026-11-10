import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { atomicPrivateWrite, readPrivateFile } from "./storage";
import { writeSharedComposeFiles } from "../shared/files";
import { localServicesEnvironment } from "../environment";
import { serviceCredentials } from "../shared/project";
import { localServicesIdentity } from "../state";
import type { LocalServicesState } from "../state";
import type { InstallationConfig } from "../../installation";
import type { StackRelease } from "../../releases/model";
import type { UlviaPaths } from "../../../paths";
import type { ComposeProject } from "../compose";

const FILES = [
    "services.yml",
    "services-tls.yml",
    "mongo/provision-provider.js",
    "shared-edges.json",
    "proxy/caddy.json",
    "environment.json",
] as const;
const digest = (files: Record<string, string>) =>
    `sha256:${createHash("sha256").update(JSON.stringify(files)).digest("hex")}`;
function deploymentDirectory(paths: UlviaPaths, state: Pick<LocalServicesState, "id">): string {
    return join(paths.services, "deployments", state.id);
}

export async function prepareDeployment(
    paths: UlviaPaths,
    installation: InstallationConfig,
    release: StackRelease,
    images: LocalServicesState["images"],
): Promise<LocalServicesState> {
    const credentials = await serviceCredentials(paths);
    const state = {
        id: randomUUID(),
        ...localServicesIdentity(paths),
        installation,
        release,
        images,
        artifactDigest: "",
    };
    const directory = deploymentDirectory(paths, state);
    for (const [name, text] of Object.entries(release.files)) {
        await atomicPrivateWrite(join(directory, name), text);
    }
    await writeSharedComposeFiles({ ...paths, services: directory }, installation);
    const environment = localServicesEnvironment(paths, installation, state, credentials);
    environment.ULVIA_CADDY_CONFIG = join(directory, "proxy/caddy.json");
    environment.ULVIA_CADDY_CONFIG_DIGEST = createHash("sha256")
        .update(`${release.digest}:${JSON.stringify(installation)}`)
        .digest("hex");
    await atomicPrivateWrite(join(directory, "environment.json"), JSON.stringify(environment));
    return { ...state, artifactDigest: digest(await readArtifacts(directory)) };
}

export async function deploymentProject(paths: UlviaPaths, state: LocalServicesState): Promise<ComposeProject> {
    const directory = deploymentDirectory(paths, state);
    const files = await readArtifacts(directory);
    if (digest(files) !== state.artifactDigest) {
        throw new Error("Applied deployment artifacts are missing or changed; explicit recovery is required");
    }
    const environment = JSON.parse(files["environment.json"]!) as Record<string, string>;
    if (
        !environment ||
        typeof environment !== "object" ||
        Array.isArray(environment) ||
        Object.values(environment).some((value) => typeof value !== "string")
    ) {
        throw new Error("Invalid applied deployment environment");
    }
    return {
        definition: "services",
        overlays: state.installation.tls.mode === "acme" ? ["services-tls"] : [],
        directory,
        generatedFile: join(directory, "shared-edges.json"),
        projectName: state.projectName,
        environment,
    };
}

async function readArtifacts(directory: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const name of FILES) {
        const text = await readPrivateFile(join(directory, name));
        if (text === null) {
            throw new Error("Deployment artifacts are missing; run ulvia apply or restore the applied snapshot");
        }
        files[name] = text;
    }
    return files;
}
