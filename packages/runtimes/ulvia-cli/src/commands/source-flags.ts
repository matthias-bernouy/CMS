import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { resolve } from "node:path";

export type SourceCommandFlags = Readonly<{
    kind?: string;
    root: string;
    version?: string;
    all: boolean;
}>;

export function parseSourceCommandFlags(
    command: string,
    args: readonly string[],
    cwd: string,
    options: Readonly<{ allowAll: boolean }>,
): SourceCommandFlags {
    let kind: string | undefined;
    let root = cwd;
    let version: string | undefined;
    let all = false;
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index]!;
        if (argument === "--all" && options.allowAll) {
            all = true;
            continue;
        }
        if (argument === "--root" || argument.startsWith("--root=")) {
            const value = argument === "--root" ? args[++index] : argument.slice("--root=".length);
            if (!value) {
                throw new Error("--root requires a source directory");
            }
            root = resolve(cwd, value);
            continue;
        }
        if (argument === "--version" || argument.startsWith("--version=")) {
            const value = argument === "--version" ? args[++index] : argument.slice("--version=".length);
            if (!value) {
                throw new Error("--version requires an exact version");
            }
            version = assertIntegrationPackageVersion(value);
            continue;
        }
        if (argument.startsWith("-")) {
            throw new Error(`Unknown ${command} option: ${argument}`);
        }
        if (kind) {
            throw new Error(`${command} accepts one integration name`);
        }
        kind = assertIntegrationPackageKind(argument);
    }
    if (all && (kind || version)) {
        throw new Error("--all cannot be combined with an integration name or --version");
    }
    if (!kind && !all) {
        throw new Error(`${command} requires an integration name${options.allowAll ? " or --all" : ""}`);
    }
    return { ...(kind ? { kind } : {}), root, ...(version ? { version } : {}), all };
}
