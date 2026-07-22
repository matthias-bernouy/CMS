import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { IntegrationRuntimeError } from "../../core/errors";

export function safeJoin(root: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(join(base, ...parts));
    const relation = relative(base, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${parts.join("/")}`);
    }
    return target;
}

export async function resolveExistingSupabasePath(root: string, ...parts: string[]): Promise<string> {
    const canonicalRoot = await realpath(root);
    const target = await realpath(safeJoin(canonicalRoot, ...parts));
    const relation = relative(canonicalRoot, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new IntegrationRuntimeError(`Path escapes Supabase connector root: ${parts.join("/")}`);
    }
    return target;
}

export function requiredText(value: string, name: string): string {
    const text = value.trim();
    if (!text) {
        throw new IntegrationRuntimeError(`Supabase connector deployer ${name} is required`);
    }
    return text;
}
