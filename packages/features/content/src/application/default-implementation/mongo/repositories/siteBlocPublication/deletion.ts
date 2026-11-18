import type { Collection } from "mongodb";
import type { BlocDoc, PageDoc } from "content/application/default-implementation/mongo/repositories/documents";
import { fromBlocDoc } from "content/application/default-implementation/mongo/repositories/documents";
import {
    requireSiteBlocDeletion,
    SiteBlocReferencedError,
    SiteBlocReferenceCheckError,
    SITE_BLOC_REFERENCE_LIMIT,
} from "content/blocs/core/catalogue/editing/references";
import type { SiteBlocConsumer } from "content/blocs/core/catalogue/editing/references";
import {
    BlocRevisionConflictError,
    BlocPublicationConflictError,
    SiteBlocNotFoundError,
} from "content/application/core/validation/errors";
import { assertSiteBlocIdentity } from "content/blocs/core/catalogue/editing/references";

/** Caller holds the reference-write lease; the storage mutation enters committing. */
export async function deleteMongoSiteBloc(
    blocs: Collection<BlocDoc>,
    pages: Collection<PageDoc>,
    tag: string,
    revision: number,
    identity: string,
) {
    let record;
    try {
        record = fromBlocDoc(await blocs.findOne({ _id: tag }));
    } catch {
        throw new SiteBlocReferenceCheckError();
    }
    const definition = requireSiteBlocDeletion(record, tag, revision, identity);
    const limit = SITE_BLOC_REFERENCE_LIMIT + 1;
    const references = await consumers(blocs, pages, tag, limit);
    if (references.length) {
        throw new SiteBlocReferencedError(references);
    }
    const result = await blocs.deleteOne({
        _id: tag,
        "ownership.kind": "site-builder",
        "ownership.definitionId": definition.ownership.definitionId,
        "siteDefinition.draftRevision": revision,
        "siteDefinition.updatedAt": { $eq: definition.updatedAt },
    });
    if (result.deletedCount !== 1) {
        const latest = fromBlocDoc(await blocs.findOne({ _id: tag }));
        if (!latest?.siteDefinition) {
            throw new SiteBlocNotFoundError(tag);
        }
        assertSiteBlocIdentity(latest, identity);
        if (latest.siteDefinition.draftRevision !== revision) {
            throw new BlocRevisionConflictError(tag, revision, latest.siteDefinition.draftRevision);
        }
        throw new BlocPublicationConflictError(
            tag,
            definition.publishedRevision,
            latest.siteDefinition.publishedRevision,
        );
    }
}

async function consumers(blocs: Collection<BlocDoc>, pages: Collection<PageDoc>, tag: string, limit: number) {
    try {
        const pageRows = await pages
            .find({ contentReferences: `bloc:${tag}` }, { projection: { _id: 1 }, maxTimeMS: 1000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        const references: SiteBlocConsumer[] = pageRows.map(({ _id }) => ({ kind: "page", id: _id }));
        if (references.length < limit) {
            const rows = await blocs
                .find(
                    {
                        _id: { $ne: tag },
                        contentReferences: `bloc:${tag}`,
                    },
                    { projection: { _id: 1 }, maxTimeMS: 1000 },
                )
                .sort({ _id: 1 })
                .limit(limit - references.length)
                .toArray();
            references.push(...rows.map(({ _id }) => ({ kind: "bloc" as const, id: _id })));
        }
        return references;
    } catch {
        throw new SiteBlocReferenceCheckError();
    }
}
