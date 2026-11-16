import { join } from "node:path";

const VERSION =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/u;

export function distributionVersion(args: readonly string[], required: boolean): string | undefined {
    if (!required && args.length === 0) {
        return undefined;
    }
    if (args.length !== 2 || args[0] !== "--version" || !args[1] || !VERSION.test(args[1])) {
        throw new Error(`Usage: bun run ${required ? "publish --version <version>" : "build [--version <version>]"}`);
    }
    return args[1];
}

export function distributionRoot(root: string, version: string): string {
    if (!VERSION.test(version)) {
        throw new Error("Invalid distribution version");
    }
    return join(root, "artifacts/distributions", version);
}
