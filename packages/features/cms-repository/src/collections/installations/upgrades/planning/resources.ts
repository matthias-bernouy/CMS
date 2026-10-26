import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import { collectionLifecycleResources } from "../../../core/validation/lifecycle/resources";
import type { CollectionResourceChange, UpgradeIssue } from "../interfaces";
import type { UsageInventory } from "../usage/interfaces";

export function resourceChanges(
    previous: readonly CollectionRelease[],
    next: readonly CollectionRelease[],
): CollectionResourceChange[] {
    const changes: CollectionResourceChange[] = [];
    for (const release of previous) {
        const target = next.find((candidate) => candidate.collectionId === release.collectionId);
        if (!target) {
            continue;
        }
        const before = collectionLifecycleResources(release);
        const after = new Map(
            collectionLifecycleResources(target).map((resource) => [`${resource.kind}:${resource.id}`, resource]),
        );
        for (const resource of before) {
            const key = `${resource.kind}:${resource.id}`;
            const replacement = after.get(key);
            if (!replacement) {
                changes.push({
                    collectionId: release.collectionId,
                    kind: resource.kind,
                    id: resource.id,
                    change: "removed",
                    ...(resource.deprecation?.replacedBy ? { replacement: resource.deprecation.replacedBy } : {}),
                });
            } else if (replacement.deprecation && !resource.deprecation) {
                changes.push({
                    collectionId: release.collectionId,
                    kind: resource.kind,
                    id: resource.id,
                    change: "deprecated",
                    ...(replacement.deprecation.replacedBy ? { replacement: replacement.deprecation.replacedBy } : {}),
                });
            }
            after.delete(key);
        }
        for (const resource of after.values()) {
            changes.push({ collectionId: release.collectionId, kind: resource.kind, id: resource.id, change: "added" });
        }
    }
    return changes;
}

export function validateResourceUses(
    inventory: UsageInventory,
    releases: readonly CollectionRelease[],
    changes: readonly CollectionResourceChange[],
): UpgradeIssue[] {
    const available = new Set(
        releases.flatMap((release) =>
            collectionLifecycleResources(release).map(
                (resource) => `${release.collectionId}:${resource.kind}:${resource.id}`,
            ),
        ),
    );
    return inventory.references.flatMap((reference): UpgradeIssue[] => {
        if (
            reference.type !== "resource" ||
            reference.scope !== "runtime" ||
            available.has(`${reference.collectionId}:${reference.kind}:${reference.id}`)
        ) {
            return [];
        }
        const removed = changes.find(
            (change) =>
                change.collectionId === reference.collectionId &&
                change.kind === reference.kind &&
                change.id === reference.id,
        );
        return [
            {
                code: "missing-resource",
                location: reference.location,
                message: `Required ${reference.kind} ${reference.collectionId}:${reference.id} is absent from the target releases`,
                ...(removed?.replacement ? { replacement: removed.replacement } : {}),
            },
        ];
    });
}
