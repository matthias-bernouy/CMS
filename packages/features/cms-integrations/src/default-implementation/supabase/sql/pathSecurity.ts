import { realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { IntegrationRuntimeError } from "../../../core/errors";

type SqlReferenceOptions = {
    connectorRoot: string;
    bundleRoot: string;
    fromFile: string;
    reference: string;
    extension: ".json" | ".sql";
};

export async function resolveSqlReference(options: SqlReferenceOptions): Promise<string> {
    validateReference(options.reference, options.extension);
    let target: string;
    try {
        target = await realpath(resolve(dirname(options.fromFile), options.reference));
    } catch {
        throw new IntegrationRuntimeError(
            `Supabase SQL ${referenceKind(options.extension)} was not found: ${options.reference}`,
        );
    }
    assertWithin(options.connectorRoot, target, "Supabase connector root", options.reference);
    assertWithin(options.bundleRoot, target, "bundle root", options.reference);
    if (!(await stat(target)).isFile()) {
        throw new IntegrationRuntimeError(`Supabase SQL reference is not a file: ${options.reference}`);
    }
    return target;
}

export function validateReference(reference: string, extension: ".json" | ".sql"): void {
    if (
        !reference ||
        reference !== reference.trim() ||
        isAbsolute(reference) ||
        /^[a-zA-Z]:\//u.test(reference) ||
        reference.includes("\\") ||
        reference.split("/").includes("..") ||
        /[\u0000-\u001f\u007f]/u.test(reference)
    ) {
        throw new IntegrationRuntimeError(`Invalid Supabase SQL path: ${reference}`);
    }
    if (extname(reference) !== extension) {
        throw new IntegrationRuntimeError(
            `Supabase SQL ${referenceKind(extension)} must use the ${extension} extension: ${reference}`,
        );
    }
}

export function assertWithin(root: string, target: string, boundary: string, source: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new IntegrationRuntimeError(`Supabase SQL path escapes ${boundary}: ${source}`);
    }
}

function referenceKind(extension: ".json" | ".sql"): string {
    return extension === ".json" ? "manifest" : "fragment";
}
