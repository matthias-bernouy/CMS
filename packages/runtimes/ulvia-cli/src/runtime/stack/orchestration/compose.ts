import { join } from "node:path";
import { runCommand } from "../../process";

export type ComposeServiceState = Readonly<{
    service: string;
    state: string;
    health: string;
    image?: string;
}>;

export type ComposeProject = Readonly<{
    definition: "services";
    overlays?: readonly "services-tls"[];
    projectName: string;
    environment: Record<string, string | undefined>;
    generatedFile?: string;
    directory?: string;
}>;

export async function composeUp(project: ComposeProject, services?: readonly string[]): Promise<void> {
    await compose(
        project,
        ["up", "--detach", "--wait", ...(services ? ["--no-deps", ...services] : ["--remove-orphans"])],
        true,
    );
}
export async function composeStart(project: ComposeProject): Promise<void> {
    await compose(project, ["start", "--wait", "--wait-timeout", "120"], true);
}

export async function checkProviderImageRetention(project: ComposeProject): Promise<void> {
    await compose(
        project,
        [
            "run",
            "--rm",
            "--no-deps",
            "--entrypoint",
            "bun",
            "provider",
            "--no-macros",
            "run",
            "packages/runtimes/ulvia-provider-server/src/checkRetention.ts",
        ],
        true,
    );
}

export function composeWorker(project: ComposeProject, args: readonly string[]) {
    return compose(project, args, false);
}

export async function composeStop(project: ComposeProject): Promise<void> {
    await compose(project, ["stop"], true);
}

export async function composeDown(project: ComposeProject): Promise<void> {
    await compose(project, ["down", "--remove-orphans", "--volumes"], true);
}

export async function inspectComposeServices(project: ComposeProject): Promise<ComposeServiceState[]> {
    const result = await compose(project, ["ps", "--all", "--format", "json"], false, true);
    if (result.exitCode !== 0) {
        throw new Error(
            "Cannot inspect the installation: Docker is unavailable or the project configuration was refused",
        );
    }
    if (!result.stdout.trim()) {
        return [];
    }
    return parseComposeServices(result.stdout);
}

function compose(project: ComposeProject, args: readonly string[], inherit: boolean, allowFailure = false) {
    const definitions = [project.definition, ...(project.overlays ?? [])];
    const files = definitions.flatMap((definition) => [
        "--file",
        join(project.directory ?? join(import.meta.dir, "definitions"), `${definition}.yml`),
    ]);
    if (project.generatedFile) {
        files.push("--file", project.generatedFile);
    }
    return runCommand(["docker", "compose", "--project-name", project.projectName, ...files, ...args], {
        env: { ...process.env, ...project.environment },
        inherit,
        allowFailure,
    });
}

export function parseComposeServices(source: string): ComposeServiceState[] {
    const trimmed = source.trim();
    const values = trimmed.startsWith("[")
        ? (JSON.parse(trimmed) as unknown[])
        : trimmed.split("\n").map((line) => JSON.parse(line) as unknown);
    return values.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Docker Compose returned an invalid service state");
        }
        const record = value as Record<string, unknown>;
        if (typeof record.Service !== "string" || typeof record.State !== "string") {
            throw new Error("Docker Compose returned an incomplete service state");
        }
        return {
            service: record.Service,
            state: record.State,
            health: typeof record.Health === "string" ? record.Health : "",
            ...(typeof record.Image === "string" ? { image: record.Image } : {}),
        };
    });
}
