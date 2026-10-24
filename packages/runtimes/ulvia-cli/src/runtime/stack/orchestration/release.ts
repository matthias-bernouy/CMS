import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { requireExecutable, runCommand } from "../../process";

export const LOCAL_STACK_VERSION = "0.0.1-alpha.7";

export const LOCAL_STACK_IMAGES = Object.freeze({
    kernel: `ulvia-kernel:${LOCAL_STACK_VERSION}`,
    provider: `ulvia-provider:${LOCAL_STACK_VERSION}`,
    repository: `ulvia-official-repository:${LOCAL_STACK_VERSION}`,
});

const IMAGE_DEFINITIONS = [
    [LOCAL_STACK_IMAGES.kernel, "infra/images/kernel/Dockerfile"],
    [LOCAL_STACK_IMAGES.provider, "infra/images/provider/Dockerfile"],
    [LOCAL_STACK_IMAGES.repository, "infra/images/official-repository/Dockerfile"],
] as const;

export async function ensureLocalServiceImages(log: (message: string) => void): Promise<void> {
    await ensureImages([IMAGE_DEFINITIONS[1], IMAGE_DEFINITIONS[2]], log);
}

export async function ensureLocalKernelImage(log: (message: string) => void): Promise<void> {
    await ensureImages([IMAGE_DEFINITIONS[0]], log);
}

async function ensureImages(
    definitions: readonly (typeof IMAGE_DEFINITIONS)[number][],
    log: (message: string) => void,
): Promise<void> {
    requireExecutable("docker");
    await runCommand(["docker", "compose", "version"]);
    const missing: (typeof IMAGE_DEFINITIONS)[number][] = [];
    for (const definition of definitions) {
        const inspected = await runCommand(["docker", "image", "inspect", definition[0]], { allowFailure: true });
        if (inspected.exitCode !== 0) {
            missing.push(definition);
        }
    }
    if (missing.length === 0) {
        return;
    }
    const workspace = await findWorkspaceRoot();
    const revision = await readRevision(workspace);
    for (const [image, dockerfile] of missing) {
        log(`Building ${image}...`);
        await runCommand(
            [
                "docker",
                "build",
                "--build-arg",
                `IMAGE_VERSION=${LOCAL_STACK_VERSION}`,
                "--build-arg",
                `VCS_REF=${revision}`,
                "--file",
                join(workspace, dockerfile),
                "--tag",
                image,
                workspace,
            ],
            { inherit: true },
        );
    }
}

async function findWorkspaceRoot(): Promise<string> {
    let directory = import.meta.dir;
    while (true) {
        if (await exists(join(directory, "infra/images/kernel/Dockerfile"))) {
            return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            throw new Error("Ulvia local images are unavailable from this CLI installation");
        }
        directory = parent;
    }
}

async function readRevision(workspace: string): Promise<string> {
    const result = await runCommand(["git", "rev-parse", "HEAD"], { cwd: workspace, allowFailure: true });
    return result.exitCode === 0 && /^[a-f0-9]{40}$/u.test(result.stdout.trim()) ? result.stdout.trim() : "unknown";
}

async function exists(path: string): Promise<boolean> {
    return await access(path).then(
        () => true,
        () => false,
    );
}
