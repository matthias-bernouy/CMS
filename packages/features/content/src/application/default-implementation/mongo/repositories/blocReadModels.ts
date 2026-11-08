import type { ClientSession, Collection } from "mongodb";
import { SiteBlocNotFoundError } from "content/application/core/validation/errors";
import type { BlocRecord } from "content/blocs/interfaces/blocs";
import { type BlocDoc, fromBlocDoc } from "content/application/default-implementation/mongo/repositories/documents";

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

export { projectBlocList } from "content/application/core/projectBlocList";
