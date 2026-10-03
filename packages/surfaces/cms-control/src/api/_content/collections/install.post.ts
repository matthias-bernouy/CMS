import { composeCollectionThemes } from "@bernouy/cms-content";
import type { CollectionRepositoryReference } from "@bernouy/cms-repository/collections/sources";
import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import { collectionBody } from "cms-control/core/content/installedCollections/body";
import { collectionService, invalidateCollections } from "cms-control/core/content/installedCollections/service";

/** Accepts an exact repository reference; release bytes are fetched server-side. */
export default async function install(req: Request, cms: ControlCms) {
    await requireControlAdministrator(req, cms);
    const input = await collectionBody(req);
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
        throw Object.assign(new Error("A nonnegative collection revision is required"), { status: 400 });
    }
    const revision = input.revision as number;
    const { store, siteId, sources = [] } = collectionService(cms);
    const source = sources.find((item) => item.id === input.repositoryId);
    if (!source) {
        throw Object.assign(new Error("Unknown collection repository"), { status: 404 });
    }
    const sourceId = source.id;
    const entries = await source.list();
    const selected = entries.find(
        (item) =>
            item.publisherId === input.publisherId &&
            item.collectionId === input.collectionId &&
            item.version === input.version &&
            item.digest === input.digest,
    );
    if (!selected) {
        throw Object.assign(new Error("Release is not listed by this repository"), { status: 404 });
    }
    const reference: CollectionRepositoryReference = selected;
    const bundle = await source.get(reference);
    const admitted = await store.importRelease(bundle.release, bundle.assets);
    if (
        admitted.digest !== selected.digest ||
        admitted.release.publisherId !== selected.publisherId ||
        admitted.release.collectionId !== selected.collectionId ||
        admitted.release.version !== selected.version
    ) {
        throw Object.assign(new Error("Repository release differs from its catalogue entry"), { status: 409 });
    }
    const installed = await store.snapshot(siteId);
    for (const bloc of admitted.release.blocs) {
        const existing = await cms.repository.getBlocRecord(bloc.id);
        if (existing && existing.collectionId !== admitted.release.collectionId) {
            throw Object.assign(new Error(`Bloc tag already exists: ${bloc.id}`), { status: 409 });
        }
    }
    const current = await cms.repository.getSystem();
    composeCollectionThemes(current.theme, [
        ...installed.collections
            .filter((item) => item.collectionId !== admitted.release.collectionId)
            .map((item) => item.release),
        admitted.release,
    ]);
    const previous = installed.collections.find((item) => item.collectionId === admitted.release.collectionId);
    let migrationId: string | undefined;
    const result = previous
        ? (previous.release.dataGeneration ?? 1) !== (admitted.release.dataGeneration ?? 1)
            ? await migrateCollection()
            : await store.upgrade(siteId, admitted.digest, revision, source.id)
        : await store.install(siteId, admitted.digest, revision, source.id);
    invalidateCollections(cms);
    return Response.json(
        { ...result, collectionId: admitted.release.collectionId, ...(migrationId ? { migrationId } : {}) },
        { status: 201 },
    );

    async function migrateCollection() {
        if (!cms.config.collections?.migrations) {
            throw Object.assign(new Error("This upgrade needs the collection migration service"), { status: 503 });
        }
        const record = await cms.config.collections.migrations.execute(
            siteId,
            [{ digest: admitted.digest, repositoryId: sourceId }],
            revision,
        );
        migrationId = record.id;
        return store.snapshot(siteId);
    }
}
