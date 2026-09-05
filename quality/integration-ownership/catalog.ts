import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
    IntegrationCatalog,
    IntegrationDescriptor,
    IntegrationIdentifierCategory,
    IntegrationIdentifierOwner,
} from "./types";

const OFFICIAL_PACKAGE_ROOT = "packages/resources/official-integrations";
const INTEGRATION_AUTHORING_ROOT = `${OFFICIAL_PACKAGE_ROOT}/integrations`;
const RESOURCE_TYPES = new Set(["bloc", "dashboard", "function", "source", "trigger"]);

export async function discoverIntegrationCatalog(repositoryRoot: string): Promise<IntegrationCatalog> {
    const packageRoot = join(repositoryRoot, OFFICIAL_PACKAGE_ROOT);
    const authoringRoot = join(repositoryRoot, INTEGRATION_AUTHORING_ROOT);
    const manifests = await findFiles(authoringRoot, "integration.json");
    const identifiers = new Map<string, IntegrationIdentifierOwner[]>();
    const descriptors: IntegrationDescriptor[] = [];

    for (const manifestPath of manifests) {
        const manifest = asRecord(JSON.parse(await readFile(manifestPath, "utf8")));
        const kind = manifest && typeof manifest.kind === "string" ? manifest.kind : undefined;
        if (!kind) {
            continue;
        }
        const root = dirname(manifestPath);
        descriptors.push({ kind, root });
        for (const path of await findFiles(root, undefined, ".json")) {
            collectIdentifiers(JSON.parse(await readFile(path, "utf8")), kind, identifiers);
        }
    }

    return {
        authoringRoot,
        descriptors: descriptors.sort((left, right) => left.kind.localeCompare(right.kind)),
        identifiers,
        packageRoot,
    };
}

async function findFiles(root: string, exactName?: string, extension?: string): Promise<string[]> {
    const files: string[] = [];
    async function visit(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return;
            }
            throw error;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".")) {
                continue;
            }
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(path);
            } else if (
                entry.isFile() &&
                (exactName === undefined || entry.name === exactName) &&
                (extension === undefined || entry.name.endsWith(extension))
            ) {
                files.push(path);
            }
        }
    }
    await visit(root);
    return files.sort();
}

function collectIdentifiers(
    value: unknown,
    kind: string,
    identifiers: Map<string, IntegrationIdentifierOwner[]>,
): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectIdentifiers(item, kind, identifiers);
        }
        return;
    }
    const record = asRecord(value);
    if (!record) {
        return;
    }

    addString(record.endpointId, "endpoint-id", kind, identifiers);
    addTypedIdentifier(record, "bloc", "tag", "bloc-tag", kind, identifiers);
    addTypedIdentifier(record, "dashboard", "id", "dashboard-id", kind, identifiers);
    addTypedIdentifier(record, "function", "id", "function-id", kind, identifiers);
    addTypedIdentifier(record, "source", "id", "source-id", kind, identifiers);
    addTypedIdentifier(record, "trigger", "id", "trigger-id", kind, identifiers);
    if (typeof record.type === "string" && RESOURCE_TYPES.has(record.type)) {
        addString(record.id, "resource-id", kind, identifiers);
        addString(record.artifact, "artifact-id", kind, identifiers);
    }

    for (const child of Object.values(record)) {
        collectIdentifiers(child, kind, identifiers);
    }
}

function addTypedIdentifier(
    record: Record<string, unknown>,
    container: string,
    field: string,
    category: IntegrationIdentifierCategory,
    kind: string,
    identifiers: Map<string, IntegrationIdentifierOwner[]>,
): void {
    const nested = asRecord(record[container]);
    if (record.type === container && nested) {
        addString(nested[field], category, kind, identifiers);
    }
}

function addString(
    value: unknown,
    category: IntegrationIdentifierCategory,
    kind: string,
    identifiers: Map<string, IntegrationIdentifierOwner[]>,
): void {
    if (typeof value !== "string" || value.includes("{{")) {
        return;
    }
    const owners = identifiers.get(value) ?? [];
    if (!owners.some((owner) => owner.kind === kind && owner.category === category)) {
        owners.push({ category, kind });
        identifiers.set(value, owners);
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
