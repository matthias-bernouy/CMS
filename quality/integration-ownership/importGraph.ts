import { isAbsolute, resolve } from "node:path";
import { toRelativePath } from "../architecture/core/pathUtils";
import type { ScannedSource } from "./source/scan";
import type { IntegrationOwnershipFinding } from "./types";

export function inferTransitiveOwnership(
    repositoryRoot: string,
    sources: readonly ScannedSource[],
    directFindings: readonly IntegrationOwnershipFinding[],
): IntegrationOwnershipFinding[] {
    const files = new Set(sources.map(({ file }) => file));
    const imports = new Map<string, Set<string>>();
    const importers = new Map<string, Set<string>>();
    for (const source of sources) {
        const local = new Set(
            source.imports
                .map((specifier) => resolveLocalImport(source.file, specifier, files))
                .filter((file): file is string => file !== undefined),
        );
        imports.set(source.file, local);
        for (const dependency of local) {
            const inbound = importers.get(dependency) ?? new Set<string>();
            inbound.add(source.file);
            importers.set(dependency, inbound);
        }
    }

    const ownersByFile = new Map<string, Set<string>>();
    const highFiles = new Set(directFindings.filter(({ confidence }) => confidence === "high").map(({ file }) => file));
    for (const finding of directFindings) {
        if (!highFiles.has(finding.file) || finding.owners.length === 0) {
            continue;
        }
        const absolute = [...files].find((file) => toRelativePath(repositoryRoot, file) === finding.file);
        if (absolute) {
            addOwners(ownersByFile, absolute, finding.owners);
        }
    }
    const directFiles = new Set(ownersByFile.keys());
    propagateDependents(ownersByFile, importers);
    const dependentFiles = new Set([...ownersByFile.keys()].filter((file) => !directFiles.has(file)));
    propagateExclusiveSupport(ownersByFile, imports, importers);

    const findings: IntegrationOwnershipFinding[] = [];
    for (const [file, owners] of ownersByFile) {
        if (directFiles.has(file)) {
            continue;
        }
        const dependent = dependentFiles.has(file);
        findings.push({
            confidence: "review",
            evidence: dependent ? "owned-dependent" : "owned-support",
            file: toRelativePath(repositoryRoot, file),
            message: dependent
                ? `Depends on code with concrete integration ownership (${[...owners].sort().join(", ")}).`
                : `Is used exclusively by code with concrete integration ownership (${[...owners].sort().join(", ")}).`,
            owners: [...owners].sort(),
        });
    }
    return findings;
}

function propagateDependents(
    ownersByFile: Map<string, Set<string>>,
    importers: ReadonlyMap<string, Set<string>>,
): void {
    let changed = true;
    while (changed) {
        changed = false;
        for (const [owned, owners] of [...ownersByFile]) {
            for (const importer of importers.get(owned) ?? []) {
                changed = addOwners(ownersByFile, importer, owners) || changed;
            }
        }
    }
}

function propagateExclusiveSupport(
    ownersByFile: Map<string, Set<string>>,
    imports: ReadonlyMap<string, Set<string>>,
    importers: ReadonlyMap<string, Set<string>>,
): void {
    let changed = true;
    while (changed) {
        changed = false;
        for (const [owned, owners] of [...ownersByFile]) {
            for (const dependency of imports.get(owned) ?? []) {
                const inbound = importers.get(dependency) ?? new Set<string>();
                const exclusivelyOwned = [...inbound].every((importer) => {
                    const importerOwners = ownersByFile.get(importer);
                    return importerOwners && [...owners].every((owner) => importerOwners.has(owner));
                });
                if (exclusivelyOwned) {
                    changed = addOwners(ownersByFile, dependency, owners) || changed;
                }
            }
        }
    }
}

function addOwners(target: Map<string, Set<string>>, file: string, owners: Iterable<string>): boolean {
    const current = target.get(file) ?? new Set<string>();
    const size = current.size;
    for (const owner of owners) {
        current.add(owner);
    }
    target.set(file, current);
    return current.size !== size;
}

function resolveLocalImport(importer: string, specifier: string, files: ReadonlySet<string>): string | undefined {
    if (!specifier.startsWith(".")) {
        return undefined;
    }
    const unresolved = resolve(importer, "..", specifier);
    const withoutExtension = /\.[cm]?[jt]sx?$/.test(unresolved)
        ? unresolved.replace(/\.[cm]?[jt]sx?$/, "")
        : unresolved;
    const suffixes = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", "/index.ts", "/index.tsx", "/index.js"];
    for (const base of new Set([unresolved, withoutExtension])) {
        for (const suffix of suffixes) {
            const candidate = `${base}${suffix}`;
            if (isAbsolute(candidate) && files.has(candidate)) {
                return candidate;
            }
        }
    }
    return undefined;
}
