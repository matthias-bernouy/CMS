import { join } from "node:path";

const VERSION =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/u;

export function isReleaseVersion(value: unknown): value is string {
    return typeof value === "string" && VERSION.test(value);
}

export function versionArgument(args: readonly string[], usage: string): string {
    if (args.length !== 2 || args[0] !== "--version" || !isReleaseVersion(args[1])) {
        throw new Error(usage);
    }
    return args[1];
}

export function distributionVersion(args: readonly string[], required: boolean): string | undefined {
    if (!required && args.length === 0) {
        return undefined;
    }
    return versionArgument(
        args,
        `Usage: bun run ${required ? "publish --version <version>" : "build [--version <version>]"}`,
    );
}

export function distributionRoot(root: string, version: string): string {
    if (!isReleaseVersion(version)) {
        throw new Error("Invalid distribution version");
    }
    return join(root, "artifacts/distributions", version);
}

export type PublicationPhase = "all" | "runtime" | "catalogue";
export function publicationOptions(args: readonly string[]): { version: string; phase: PublicationPhase } {
    const usage = "Usage: bun run publish --version <version> [--phase all|runtime|catalogue]";
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1];
        if (!["--version", "--phase"].includes(key) || values.has(key) || !value || value.startsWith("--")) {
            throw new Error(usage);
        }
        values.set(key, value);
    }
    const version = values.get("--version");
    const phase = values.get("--phase") ?? "all";
    if (!isReleaseVersion(version) || !["all", "runtime", "catalogue"].includes(phase)) {
        throw new Error(usage);
    }
    return { version, phase: phase as PublicationPhase };
}
