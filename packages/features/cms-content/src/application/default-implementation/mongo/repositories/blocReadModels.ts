import type { ClientSession, Collection } from "mongodb";
import { SiteBlocNotFoundError } from "cms-content/application/core/validation/errors";
import type { BlocRecord } from "cms-content/blocs/interfaces/blocs";
import { type BlocDoc, fromBlocDoc } from "cms-content/application/default-implementation/mongo/repositories/documents";

export async function requireBlocRecord(
    blocs: Collection<BlocDoc>,
    tag: string,
    session?: ClientSession,
): Promise<BlocRecord> {
    const record = fromBlocDoc(await blocs.findOne({ _id: tag }, session ? { session } : undefined));
    if (!record) {
        throw new SiteBlocNotFoundError(tag);
    }
    return record;
}

export { projectBlocList } from "cms-content/application/core/projectBlocList";
