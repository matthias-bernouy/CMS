import type { Collection, Db } from "mongodb";
import type { SiteBlocPublicationLockDoc } from "content/application/default-implementation/mongo/repositories/documents";
import { SiteBlocPublicationRecoveryRequiredError } from "content/application/core/validation/errors";
import { SiteBlocPublicationLockLostError } from "content/application/core/validation/errors";
import { MONGO_PUBLICATION_GUARDS } from "../state";
import { withMongoSiteBlocPublicationLock } from "../lock";
import { referenceWrites } from "./outcomes";

export function withMongoContentReferenceWrite<T>(
    db: Db,
    locks: Collection<SiteBlocPublicationLockDoc>,
    operation: () => Promise<T>,
): Promise<T> {
    return withMongoSiteBlocPublicationLock(db, locks, (guard) =>
        referenceWrites.run({ db, locks, guard, unresolved: new Set() }, async () => {
            const result = await operation();
            if (MONGO_PUBLICATION_GUARDS.get(guard)?.lost) {
                throw new SiteBlocPublicationLockLostError();
            }
            if (referenceWrites.getStore()!.unresolved.size) {
                throw new SiteBlocPublicationRecoveryRequiredError();
            }
            return result;
        }),
    );
}
export { referenceWriteCollection } from "./collection";
