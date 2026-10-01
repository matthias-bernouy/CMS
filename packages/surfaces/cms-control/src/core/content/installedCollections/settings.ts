import type { TBloc } from "@bernouy/cms-content";

type InstalledSettings = Pick<TBloc, "id" | "defaultContent" | "collectionSettings">;

/** The inserted host owns settings; the collection keeps only its fixed Light DOM. */
export function installedBlocInitialMarkup(bloc: InstalledSettings): string {
    const attributes = (bloc.collectionSettings ?? [])
        .flatMap(({ id, default: value }) => {
            if (value === false || value === null || value === undefined) {
                return [];
            }
            return [value === true ? ` ${id}` : ` ${id}="${escapeAttribute(String(value))}"`];
        })
        .join("");
    return `<${bloc.id}${attributes}>${bloc.defaultContent ?? ""}</${bloc.id}>`;
}

function escapeAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
