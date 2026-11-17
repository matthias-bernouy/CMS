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
