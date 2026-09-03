import { requireExecutable, runCommand, type CommandResult } from "../../../runtime/process";

type DockerCommand = (arguments_: readonly string[]) => Promise<CommandResult>;

export async function captureReleaseSandboxDockerVolumes(
    projectRef: string,
    command: DockerCommand = runDockerCommand,
): Promise<readonly string[]> {
    assertProjectRef(projectRef);
    const inventory = await command([
        "container",
        "ls",
        "--all",
        "--filter",
        `name=${projectRef}`,
        "--format",
        "{{json .}}",
    ]);
    requireSuccess(inventory, "list release sandbox containers");
    const containerIds = releaseSandboxContainerIds(inventory.stdout, projectRef);
    if (containerIds.length === 0) {
        return [];
    }
    const inspected = await command(["container", "inspect", "--format", "{{json .Mounts}}", ...containerIds]);
    requireSuccess(inspected, "inspect release sandbox container volumes");
    return mountedDockerVolumes(inspected.stdout);
}

export async function removeReleaseSandboxDockerVolumes(
    volumes: readonly string[],
    command: DockerCommand = runDockerCommand,
): Promise<void> {
    for (const volume of new Set(volumes)) {
        assertVolumeName(volume);
        const removed = await command(["volume", "rm", volume]);
        if (removed.exitCode === 0) {
            continue;
        }
        const remaining = await command(["volume", "inspect", volume]);
        if (remaining.exitCode === 0) {
            throw new Error(`Docker retained release sandbox volume ${volume}`);
        }
    }
}

export function releaseSandboxContainerIds(output: string, projectRef: string): readonly string[] {
    assertProjectRef(projectRef);
    return output
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter(
            (entry) =>
                typeof entry.Names === "string" &&
                entry.Names.startsWith("supabase_") &&
                entry.Names.endsWith(`_${projectRef}`),
        )
        .map((entry) => {
            if (typeof entry.ID !== "string" || !/^[a-f0-9]{12,64}$/u.test(entry.ID)) {
                throw new Error("Docker returned an invalid release sandbox container ID");
            }
            return entry.ID;
        });
}

export function mountedDockerVolumes(output: string): readonly string[] {
    const volumes = new Set<string>();
    for (const line of output.split("\n").filter(Boolean)) {
        const mounts = JSON.parse(line) as unknown;
        if (!Array.isArray(mounts)) {
            throw new Error("Docker returned invalid release sandbox mounts");
        }
        for (const mount of mounts) {
            if (isVolumeMount(mount)) {
                assertVolumeName(mount.Name);
                volumes.add(mount.Name);
            }
        }
    }
    return [...volumes].toSorted();
}

async function runDockerCommand(arguments_: readonly string[]): Promise<CommandResult> {
    requireExecutable("docker");
    return await runCommand(["docker", ...arguments_], { allowFailure: true });
}

function requireSuccess(result: CommandResult, operation: string): void {
    if (result.exitCode !== 0) {
        throw new Error(`Docker failed to ${operation}`);
    }
}

function assertProjectRef(value: string): void {
    if (!/^ulvia-release-[a-f0-9]{12}$/u.test(value)) {
        throw new Error("Release sandbox project reference is invalid");
    }
}

function assertVolumeName(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/u.test(value)) {
        throw new Error("Docker returned an invalid release sandbox volume name");
    }
}

function isVolumeMount(value: unknown): value is Readonly<{ Type: "volume"; Name: string }> {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { Type?: unknown }).Type === "volume" &&
        typeof (value as { Name?: unknown }).Name === "string"
    );
}
