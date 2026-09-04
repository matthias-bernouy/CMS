import type { BlocListOptions } from "cms-content/interfaces/ContentReader";
import type { BlocListItemResponse } from "cms-content/interfaces/CmsRepository";
import type { ClientSession, Collection } from "mongodb";
import { SiteBlocNotFoundError } from "cms-content/core/validation/errors";
import type { BlocRecord } from "cms-content/interfaces/blocs";
import { type BlocDoc, fromBlocDoc } from "cms-content/default-implementation/repositories/mongo/documents";

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

export function projectBlocList(records: BlocRecord[], options: BlocListOptions = {}): BlocListItemResponse[] {
    return records.flatMap((record) => {
        const bloc = record.artifact;
        return bloc && (options.includeInactive || bloc.catalogue !== "inactive")
            ? [
                  {
                      id: record.tag,
                      name: bloc.name,
                      group: bloc.group || "",
                      description: bloc.description || "",
                      ...(bloc.compositionHTML ? { compositionHTML: bloc.compositionHTML } : {}),
                      ...(bloc.internal ? { internal: true } : {}),
                      ownership: structuredClone(record.ownership),
                  },
              ]
            : [];
    });
}
