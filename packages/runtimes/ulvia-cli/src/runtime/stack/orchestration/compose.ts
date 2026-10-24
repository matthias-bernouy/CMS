import { join } from "node:path";
import { runCommand } from "../../process";

export type ComposeServiceState = Readonly<{
    service: string;
    state: string;
    health: string;
}>;

export type ComposeProject = Readonly<{
    definition: "services" | "kernel";
    overlays?: readonly ("services-tls" | "kernel-tls")[];
    projectName: string;
    environment: Record<string, string | undefined>;
}>;

export async function composeUp(project: ComposeProject): Promise<void> {
    await compose(project, ["up", "--detach", "--wait"], true);
}

export async function composeStop(project: ComposeProject): Promise<void> {
    await compose(project, ["stop"], true);
}

export async function composeDown(project: ComposeProject): Promise<void> {
    await compose(project, ["down", "--remove-orphans", "--volumes"], true);
}

export async function inspectComposeServices(project: ComposeProject): Promise<ComposeServiceState[]> {
    const result = await compose(project, ["ps", "--all", "--format", "json"], false, true);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
        return [];
    }
    return parseComposeServices(result.stdout);
}

function compose(project: ComposeProject, args: readonly string[], inherit: boolean, allowFailure = false) {
    const definitions = [project.definition, ...(project.overlays ?? [])];
    const files = definitions.flatMap((definition) => [
        "--file",
        join(import.meta.dir, "definitions", `${definition}.yml`),
    ]);
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
        };
    });
}
