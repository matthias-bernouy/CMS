import type { CollectionRepositoryReference } from "@bernouy/cms-repository/collections/sources";
import type { CollectionMigrationTarget } from "@bernouy/cms-content/migrations";
import type { ControlCms } from "cms-control/ControlCms";
import { collectionService } from "./service";

export type CollectionReleaseTarget = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
};

export async function stageCollectionTargets(
    cms: ControlCms,
    targets: readonly CollectionReleaseTarget[],
): Promise<readonly CollectionMigrationTarget[]> {
    const { store, sources = [] } = collectionService(cms);
    return Promise.all(
        targets.map(async (input) => {
            const source = sources.find((item) => item.id === input.repositoryId);
            if (!source) {
                throw Object.assign(new Error("Unknown collection repository"), { status: 404 });
            }
            const selected = (await source.list()).find(
                (item) =>
                    item.publisherId === input.publisherId &&
                    item.collectionId === input.collectionId &&
                    item.version === input.version &&
                    item.digest === input.digest,
            );
            if (!selected) {
                throw Object.assign(new Error("Release is not listed by this repository"), { status: 404 });
            }
            const bundle = await source.get(selected as CollectionRepositoryReference);
            const admitted = await store.importRelease(bundle.release, bundle.assets);
            if (
                admitted.digest !== selected.digest ||
                admitted.release.publisherId !== selected.publisherId ||
                admitted.release.collectionId !== selected.collectionId ||
                admitted.release.version !== selected.version
            ) {
                throw Object.assign(new Error("Repository release differs from its catalogue entry"), { status: 409 });
            }
            return { digest: admitted.digest, repositoryId: source.id };
        }),
    );
}

export function parseCollectionReleaseTargets(value: unknown): readonly CollectionReleaseTarget[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 256) {
        throw Object.assign(new Error("Migration targets must be a nonempty bounded array"), { status: 400 });
    }
    return value.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw Object.assign(new Error("Invalid collection migration target"), { status: 400 });
        }
        const source = item as Record<string, unknown>;
        const keys = ["repositoryId", "publisherId", "collectionId", "version", "digest"];
        if (Object.keys(source).some((key) => !keys.includes(key)) || keys.some((key) => !source[key])) {
            throw Object.assign(new Error("Incomplete collection migration target"), { status: 400 });
        }
        return Object.fromEntries(keys.map((key) => [key, String(source[key])])) as CollectionReleaseTarget;
    });
}
