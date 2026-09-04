import type { Collection, Db } from "mongodb";
import { publishedSiteRecord } from "cms-content/core/blocs/records";
import { replaceSiteBlocRecord } from "cms-content/default-implementation/repositories/mongo/blocPersistence";
import { requireBlocRecord } from "cms-content/default-implementation/repositories/mongo/blocReadModels";
import type {
    BlocDoc,
    SiteBlocPublicationLockDoc,
} from "cms-content/default-implementation/repositories/mongo/documents";
import { commitMongoSiteBlocPublication } from "cms-content/default-implementation/repositories/mongo/siteBlocPublication/commit";
import type { SiteBlocPublicationGuard } from "cms-content/interfaces/CmsRepository";
import type { BlocRecord, TBlocWrite } from "cms-content/interfaces/blocs";

type PublicationLock = (operation: (guard: SiteBlocPublicationGuard) => Promise<BlocRecord>) => Promise<BlocRecord>;

export async function publishMongoSiteBloc(
    db: Db,
    blocs: Collection<BlocDoc>,
    locks: Collection<SiteBlocPublicationLockDoc>,
    tag: string,
    artifact: TBlocWrite,
    expectedDraftRevision: number,
    publicationDate: Date | undefined,
    guard: SiteBlocPublicationGuard | undefined,
    withPublicationLock: PublicationLock,
): Promise<BlocRecord> {
    if (!guard) {
        return withPublicationLock((acquiredGuard) =>
            commitPublication(db, blocs, locks, tag, artifact, expectedDraftRevision, publicationDate, acquiredGuard),
        );
    }
    return commitPublication(db, blocs, locks, tag, artifact, expectedDraftRevision, publicationDate, guard);
}

function commitPublication(
    db: Db,
    blocs: Collection<BlocDoc>,
    locks: Collection<SiteBlocPublicationLockDoc>,
    tag: string,
    artifact: TBlocWrite,
    expectedDraftRevision: number,
    publicationDate: Date | undefined,
    guard: SiteBlocPublicationGuard,
): Promise<BlocRecord> {
    return commitMongoSiteBlocPublication(db, guard, async (session) => {
        const current = await requireBlocRecord(blocs, tag, session);
        const published = publishedSiteRecord(current, artifact, expectedDraftRevision, publicationDate);
        await replaceSiteBlocRecord(blocs, tag, current, published, expectedDraftRevision, session);
        return structuredClone(published);
    });
}
