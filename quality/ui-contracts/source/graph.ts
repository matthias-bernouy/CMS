import { resolve, relative } from "node:path";
import type { WorkspacePackage } from "../../architecture/core/architectureTypes";
import { resolveBrowserImport } from "../../architecture/core/resolution/moduleResolution";
import { collectImports, createSourceFile } from "../../architecture/core/sourceImports";
import type { UiSource } from "../contracts/types";

export function isBrowserEntrypoint(path: string): boolean {
    return (
        path.startsWith("packages/surfaces/cms-control/src/components/") ||
        path.startsWith("packages/foundation/components/src/ui/") ||
        path.startsWith("packages/foundation/components/src/binding/") ||
        path.startsWith("packages/features/cms-editor-system-v2/src/components/") ||
        /\.client\.[cm]?[jt]sx?$/.test(path) ||
        /^packages\/resources\/[^/]+\/.*\/blocs\/.+\/(?:Bloc|BlocEditor)\.ts$/.test(path)
    );
}

/** Static import reachability includes local helpers; it does not infer runtime call execution. */
export function browserReachability(
    root: string,
    sources: readonly UiSource[],
    packages: readonly WorkspacePackage[],
): Set<string> {
    const scripts = sources.filter((source) => source.kind === "script");
    const byPath = new Map(scripts.map((source) => [resolve(root, source.path), source]));
    const files = new Set(byPath.keys());
    const packageByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    const packageByRoot = [...packages].sort((a, b) => b.root.length - a.root.length);
    const pending = scripts
        .filter((source) => isBrowserEntrypoint(source.path))
        .map((source) => resolve(root, source.path));
    const visited = new Set<string>();
    while (pending.length) {
        const file = pending.pop()!;
        if (visited.has(file)) {
            continue;
        }
        const source = byPath.get(file);
        if (!source) {
            continue;
        }
        visited.add(file);
        for (const imported of collectImports(createSourceFile(file, source.content))) {
            if (!imported.typeOnly) {
                pending.push(...resolveBrowserImport(file, imported.specifier, files, packageByName, packageByRoot));
            }
        }
    }
    return new Set([...visited].map((file) => relative(root, file).replaceAll("\\", "/")));
}
