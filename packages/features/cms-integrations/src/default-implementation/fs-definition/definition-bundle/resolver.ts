import {
    INTEGRATION_DEFINITION_BUNDLE_LIMITS,
    INTEGRATION_DEFINITION_BUNDLE_SCHEMA,
    INTEGRATION_DEFINITION_SCHEMAS,
} from "./constants";
import { resolveDefinitionFileGraph } from "./graph";
import { withJsonFile } from "./loader";
import { canonicalVersionRoot, displayPath, resolveEntryJsonFile, resolveJsonFile } from "./paths";
import { sourceNode } from "./provenance";
import type { DefinitionBundleLimits, DefinitionBundleState, ResolvedDefinitionFile } from "./types";

export async function resolveIntegrationDefinitionFile(definitionPath: string, versionRoot: string): Promise<unknown> {
    return (await resolveIntegrationDefinitionFileDetails(definitionPath, versionRoot)).value;
}

export async function resolveIntegrationDefinitionFileDetails(
    definitionPath: string,
    versionRoot: string,
    limitOverrides: Partial<DefinitionBundleLimits> = {},
): Promise<ResolvedDefinitionFile & { versionRoot: string }> {
    const root = await canonicalVersionRoot(versionRoot);
    const entryFile = await resolveEntryJsonFile(root, definitionPath);
    const state = createState(root, limitOverrides);
    const resolved = await withJsonFile(entryFile, state, 0, async (entry) => {
        if (!isBundleEntry(entry)) {
            return sourceNode(entry, entryFile);
        }
        assertBundleEntry(entry, root, entryFile);
        const bundleRoot = await resolveJsonFile(root, entryFile, entry.root);
        const value = await resolveDefinitionFileGraph(bundleRoot, state, 1);
        assertCanonicalDefinition(value.value, root, bundleRoot);
        return value;
    });
    return { ...resolved, versionRoot: root };
}

function createState(root: string, overrides: Partial<DefinitionBundleLimits>): DefinitionBundleState {
    const limits = { ...INTEGRATION_DEFINITION_BUNDLE_LIMITS, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new Error(`Integration definition bundle limit ${name} must be a positive integer`);
        }
    }
    return { activeFiles: [], bytesRead: 0, filesRead: 0, limits, versionRoot: root };
}

function assertBundleEntry(
    value: Record<string, unknown>,
    versionRoot: string,
    entryFile: string,
): asserts value is { schema: typeof INTEGRATION_DEFINITION_BUNDLE_SCHEMA; root: string } {
    const source = displayPath(versionRoot, entryFile);
    if (Object.keys(value).length !== 2 || typeof value.root !== "string" || !value.root.trim()) {
        throw new Error(`${source}: definition bundle must contain only schema and a non-empty root JSON path`);
    }
}

function assertCanonicalDefinition(value: unknown, versionRoot: string, rootFile: string): void {
    if (!isRecord(value) || !INTEGRATION_DEFINITION_SCHEMAS.includes(value.schema as never)) {
        throw new Error(
            `${displayPath(versionRoot, rootFile)}: bundle root must use a supported integration definition schema`,
        );
    }
}

function isBundleEntry(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && value.schema === INTEGRATION_DEFINITION_BUNDLE_SCHEMA;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
