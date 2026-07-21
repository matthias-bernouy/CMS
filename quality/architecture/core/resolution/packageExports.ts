import type { WorkspacePackage } from "../architectureTypes";
import { matchPattern } from "./pattern";

export function exportTargets(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const object = value as Record<string, unknown>;
    for (const preferred of ["browser", "bun", "import", "default"]) {
        if (preferred in object) return exportTargets(object[preferred]);
    }
    return Object.values(object).flatMap(exportTargets);
}

export function declaredExportTargets(exportsValue: unknown, subpath: string): string[] {
    if (typeof exportsValue === "string") return subpath === "." ? [exportsValue] : [];
    if (!exportsValue || typeof exportsValue !== "object" || Array.isArray(exportsValue)) return [];
    const exportsMap = exportsValue as Record<string, unknown>;
    const subpathKeys = Object.keys(exportsMap).filter((key) => key.startsWith("."));
    if (subpathKeys.length === 0) return subpath === "." ? exportTargets(exportsValue) : [];

    const exact = exportsMap[subpath];
    if (exact !== undefined) return exportTargets(exact);
    for (const key of subpathKeys) {
        if (!key.includes("*")) continue;
        const wildcard = matchPattern(key, subpath);
        if (wildcard === undefined) continue;
        return exportTargets(exportsMap[key]).map((target) => target.replaceAll("*", wildcard));
    }
    return [];
}

export function isDeclaredExport(exportsValue: unknown, subpath: string): boolean {
    return declaredExportTargets(exportsValue, subpath).length > 0;
}

export function parseWorkspaceSpecifier(
    specifier: string,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
): { pkg: WorkspacePackage; subpath: string } | undefined {
    for (const [name, pkg] of packageByName) {
        if (specifier === name) return { pkg, subpath: "" };
        if (specifier.startsWith(`${name}/`)) return { pkg, subpath: specifier.slice(name.length + 1) };
    }
    return undefined;
}
