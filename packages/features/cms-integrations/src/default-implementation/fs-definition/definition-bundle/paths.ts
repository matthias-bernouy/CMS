import { lstat, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertPathWithin } from "../repositorySupport";

export async function canonicalVersionRoot(versionRoot: string): Promise<string> {
    const root = await realpath(versionRoot);
    const stats = await lstat(root);
    if (!stats.isDirectory()) {
        throw new Error(`${versionRoot}: integration version root must be a directory`);
    }
    return root;
}

export async function resolveEntryJsonFile(versionRoot: string, definitionPath: string): Promise<string> {
    if (definitionPath.includes("\\")) {
        throw new Error(`${definitionPath}: integration definition path must not contain backslashes`);
    }
    const unresolved = isAbsolute(definitionPath) ? resolve(definitionPath) : resolve(versionRoot, definitionPath);
    assertPathWithin(versionRoot, unresolved, "version", definitionPath);
    const canonical = await realpath(unresolved);
    assertPathWithin(versionRoot, canonical, "version", definitionPath);
    if (extname(canonical).toLowerCase() !== ".json") {
        throw new Error(`${definitionPath}: integration definition must have a .json extension`);
    }
    const stats = await lstat(canonical);
    if (!stats.isFile()) {
        throw new Error(`${definitionPath}: integration definition must be a regular file`);
    }
    return canonical;
}

export async function resolveJsonFile(
    versionRoot: string,
    referencingFile: string,
    reference: string,
): Promise<string> {
    assertSafeReference(reference, displayPath(versionRoot, referencingFile));
    const unresolved = resolve(dirname(referencingFile), reference);
    assertPathWithin(versionRoot, unresolved, "version", reference);

    let canonical: string;
    try {
        canonical = await realpath(unresolved);
    } catch {
        throw new Error(`${displayPath(versionRoot, referencingFile)}: referenced JSON file not found: ${reference}`);
    }
    assertPathWithin(versionRoot, canonical, "version", reference);
    if (extname(canonical).toLowerCase() !== ".json") {
        throw new Error(
            `${displayPath(versionRoot, referencingFile)}: referenced file must have a .json extension: ${reference}`,
        );
    }
    const stats = await lstat(canonical);
    if (!stats.isFile()) {
        throw new Error(
            `${displayPath(versionRoot, referencingFile)}: referenced JSON path must be a regular file: ${reference}`,
        );
    }
    return canonical;
}

export function displayPath(versionRoot: string, file: string): string {
    const path = relative(versionRoot, file);
    return path.split(sep).join("/") || ".";
}

function assertSafeReference(reference: string, source: string): void {
    if (!reference.trim()) {
        throw new Error(`${source}: referenced JSON path must be a non-empty string`);
    }
    if (reference.includes("\\")) {
        throw new Error(`${source}: referenced JSON path must not contain backslashes: ${reference}`);
    }
    if (isAbsolute(reference) || /^[a-zA-Z]:\//u.test(reference)) {
        throw new Error(`${source}: referenced JSON path must be relative: ${reference}`);
    }
    if (extname(reference).toLowerCase() !== ".json") {
        throw new Error(`${source}: referenced file must have a .json extension: ${reference}`);
    }
}
