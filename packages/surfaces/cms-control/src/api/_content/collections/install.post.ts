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
    const { store, siteId, sources = [] } = collectionService(cms);
    const source = sources.find((item) => item.id === input.repositoryId);
    if (!source) {
        throw Object.assign(new Error("Unknown collection repository"), { status: 404 });
    }
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
    const result = installed.collections.some((item) => item.collectionId === admitted.release.collectionId)
        ? await store.upgrade(siteId, admitted.digest, input.revision as number, source.id)
        : await store.install(siteId, admitted.digest, input.revision as number, source.id);
    invalidateCollections(cms);
    return Response.json({ ...result, collectionId: admitted.release.collectionId }, { status: 201 });
}
