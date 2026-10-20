import type { BlocListOptions } from "cms-content/application/interfaces/CmsRepository";
import type { BlocListItemResponse } from "cms-content/application/interfaces/CmsRepository";
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

export function projectBlocList(records: BlocRecord[], options: BlocListOptions = {}): BlocListItemResponse[] {
    return records.flatMap((record) => {
        const bloc = record.artifact;
        return bloc && (options.includeHidden || bloc.catalogue !== "hidden")
            ? [
                  {
                      id: record.tag,
                      name: bloc.name,
                      group: bloc.group || "",
                      ...(bloc.catalogueOrder === undefined ? {} : { catalogueOrder: bloc.catalogueOrder }),
                      description: bloc.description || "",
                      kind: bloc.kind,
                      markupHTML: bloc.markupHTML,
                      ...(bloc.defaultContent ? { defaultContent: bloc.defaultContent } : {}),
                      ...(bloc.slots ? { slots: structuredClone(bloc.slots) } : {}),
                      ...(bloc.settings ? { settings: structuredClone(bloc.settings) } : {}),
                      ...(bloc.catalogue ? { catalogue: bloc.catalogue } : {}),
                      ...(bloc.uses ? { uses: [...bloc.uses] } : {}),
                      root: bloc.root,
                      ...(bloc.styleCSS ? { styleCSS: bloc.styleCSS } : {}),
                      ...(bloc.styleCollectionId ? { styleCollectionId: bloc.styleCollectionId } : {}),
                      hasBehavior: Boolean(bloc.viewJS),
                      ...(bloc.thumbnail ? { thumbnail: structuredClone(bloc.thumbnail) } : {}),
                      ownership: structuredClone(record.ownership),
                  },
              ]
            : [];
    });
}
