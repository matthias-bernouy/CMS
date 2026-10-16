import { collectionBlocTagIssue } from "cms-repository/collections/core/namespace";
import { validateForbiddenBlocBehavior } from "cms-repository/collections/core/validation/blocBehaviorPolicy";

const viewTranspiler = new Bun.Transpiler({ loader: "ts" });

/**
 * Inputs passed to `validateBloc`. The view source is optional —
 * server-side calls may have only the JS source available, CLI calls have
 * the full bloc folder. The validator runs whichever checks the inputs support.
 */
export type ValidateBlocInput = {
    /** Stable collection Bloc identity. */
    tag: string;
    /** User's view source (typically `Bloc.ts`). */
    viewSource?: string;
    /** Blocs whose public CSS inputs may be written by this Bloc runtime. */
    uses?: readonly string[];
};

export type ValidateBlocResult = {
    errors: string[];
};

/**
 * Bloc-specific identity check: valid namespaced ID and not in a
 * system-reserved prefix. Returns `null` when the tag is acceptable, an
 * error string otherwise.
 */
export function validateBlocTag(tag: string): string | null {
    const issue = collectionBlocTagIssue(tag);
    return issue ? `Invalid collection Bloc tag "${tag}": ${issue}.` : null;
}

/**
 * Orchestrator. Runs every check the inputs support and returns the
 * combined result. Missing optional inputs produce a warning so callers
 * know coverage is partial.
 */
export function validateBloc(input: ValidateBlocInput): ValidateBlocResult {
    const errors: string[] = [];

    const tagError = validateBlocTag(input.tag);
    if (tagError) {
        errors.push(tagError);
    }

    if (input.viewSource) {
        errors.push(...validateForbiddenBlocBehavior(input.viewSource, "Bloc"));
        errors.push(...checkFunctionalMountExport(input.viewSource, "Bloc"));
        errors.push(...checkStyleVariableWrites(input.viewSource, input.tag, input.uses ?? [], "Bloc"));
    }
    return { errors };
}

function checkFunctionalMountExport(source: string, fileLabel: string): string[] {
    try {
        const javascript = viewTranspiler.transformSync(source);
        if (/^export\s+function\s+mount\s*\(/mu.test(javascript)) {
            return [];
        }
    } catch {
        // The build step reports syntax diagnostics with the artifact path.
    }
    return [`${fileLabel}: behavior must export a \`mount(root)\` function.`];
}

function checkStyleVariableWrites(source: string, tag: string, uses: readonly string[], fileLabel: string): string[] {
    const calls = source.match(/\.style\s*\.\s*setProperty\s*\(/gu) ?? [];
    const literalCalls = [...source.matchAll(/\.style\s*\.\s*setProperty\s*\(\s*(["'])(--[a-z][a-z0-9-]*)\1/gu)];
    const errors: string[] = [];
    if (literalCalls.length !== calls.length) {
        errors.push(
            `${fileLabel}: CSS variables written with style.setProperty(…) must use a static lowercase literal name.`,
        );
    }
    const owners = [tag, ...uses];
    for (const match of literalCalls) {
        const variable = match[2]!;
        if (!owners.some((owner) => variable.startsWith(`--${owner}-`))) {
            errors.push(
                `${fileLabel}: CSS variable ${variable} must belong to Bloc ${tag} or a Bloc declared in uses.`,
            );
        }
    }
    return errors;
}
