import type { BlocListItemResponse, BlocListOptions } from "cms-content/application/interfaces/ContentRepository";
import type { BlocRecord } from "cms-content/blocs/interfaces/blocs";

export function projectBlocList(records: BlocRecord[], options: BlocListOptions = {}): BlocListItemResponse[] {
    return records.flatMap((record) => {
        const bloc = record.artifact;
        return bloc && (options.includeHidden || bloc.catalogue !== "hidden")
            ? [
                  {
                      id: record.tag,
                      name: bloc.name,
                      ...(bloc.categories ? { categories: [...bloc.categories] } : {}),
                      ...(bloc.initialDocument ? { initialDocument: structuredClone(bloc.initialDocument) } : {}),
                      group: bloc.group || "",
                      ...(bloc.catalogueOrder === undefined ? {} : { catalogueOrder: bloc.catalogueOrder }),
                      description: bloc.description || "",
                      kind: bloc.kind,
                      markupHTML: bloc.markupHTML,
                      ...(bloc.browser ? { browser: structuredClone(bloc.browser) } : {}),
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
