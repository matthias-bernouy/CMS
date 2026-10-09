import {
    collectionThemeTokenId,
    describeCollectionResources,
    type CollectionRelease,
    type CollectionResourceDescriptor,
} from "@bernouy/cms-repository/collections";
import {
    collectionUpgradeBreakingResources,
    type CollectionBreakingResource,
} from "@bernouy/cms-repository/collections/installations";
import type { CollectionMigrationResourceChange } from "./interfaces";

export async function analyzeResourceChanges(
    previous: CollectionRelease,
    next: CollectionRelease,
): Promise<{ changes: CollectionMigrationResourceChange[]; blocked: string[] }> {
    const [oldResources, newResources] = await Promise.all([
        describeCollectionResources(previous),
        describeCollectionResources(next),
    ]);
    const breaking = new Set(
        collectionUpgradeBreakingResources(previous, next).map((item) => breakingKey(previous.collectionId, item)),
    );
    const nextByKey = new Map(newResources.map((item) => [key(item), item]));
    const changes: CollectionMigrationResourceChange[] = [];
    const blocked: string[] = [];
    for (const resource of oldResources) {
        const replacement = nextByKey.get(key(resource));
        if (!replacement) {
            changes.push(change(previous.collectionId, resource, undefined, "removed"));
            continue;
        }
        nextByKey.delete(key(resource));
        if (replacement.generation < resource.generation) {
            blocked.push(`Resource generation decreases for ${resource.kind} ${resource.id}.`);
        }
        if (replacement.contractDigest !== resource.contractDigest) {
            const isBreaking = breaking.has(key(resource)) || replacement.generation > resource.generation;
            changes.push(
                change(
                    previous.collectionId,
                    resource,
                    replacement,
                    isBreaking ? "contract-breaking" : "contract-compatible",
                ),
            );
            if (isBreaking && replacement.generation <= resource.generation) {
                blocked.push(`Breaking ${resource.kind} ${resource.id} must increment its resource generation.`);
            }
        } else if (replacement.implementationDigest !== resource.implementationDigest) {
            changes.push(change(previous.collectionId, resource, replacement, "implementation"));
        }
    }
    for (const resource of nextByKey.values()) {
        changes.push(change(previous.collectionId, undefined, resource, "added"));
    }
    return { changes, blocked };
}

function change(
    collectionId: string,
    previous: CollectionResourceDescriptor | undefined,
    next: CollectionResourceDescriptor | undefined,
    kind: CollectionMigrationResourceChange["change"],
): CollectionMigrationResourceChange {
    const resource = next ?? previous!;
    return {
        collectionId,
        kind: resource.kind,
        id: resource.id,
        change: kind,
        ...(previous ? { fromGeneration: previous.generation } : {}),
        ...(next ? { toGeneration: next.generation } : {}),
    };
}

function key(resource: Pick<CollectionResourceDescriptor, "kind" | "id">): string {
    return `${resource.kind}:${resource.id}`;
}

function breakingKey(collectionId: string, resource: CollectionBreakingResource): string {
    const id = resource.kind === "theme-token" ? collectionThemeTokenId(collectionId, resource.id) : resource.id;
    return `${resource.kind}:${id}`;
}
