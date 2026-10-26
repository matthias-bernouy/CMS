import type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";

export type CmsEditorBloc = Readonly<{
    id: string;
    name: string;
    group: string;
    description: string;
    kind: "component" | "composition";
    ownership: "code-managed" | "site-builder";
    order: number;
    defaultContent: string;
    authoringJson: string;
}>;

export type CmsEditorCatalogue = Readonly<{ items: readonly CmsEditorBloc[] }>;

export async function getCmsEditorCatalogue(
    repository: Pick<ContentRepository, "getBlocsList">,
): Promise<CmsEditorCatalogue> {
    const blocs = await repository.getBlocsList();
    const items = blocs.map(
        (bloc): CmsEditorBloc => ({
            id: bloc.id,
            name: bloc.name,
            group: bloc.group,
            description: bloc.description,
            kind: bloc.kind,
            ownership: bloc.ownership.kind,
            order: bloc.catalogueOrder ?? 0,
            defaultContent: bloc.defaultContent ?? "",
            authoringJson: canonicalJson({
                slots: bloc.slots ?? {},
                ...(bloc.categories ? { categories: bloc.categories } : {}),
                ...(bloc.initialDocument ? { initialDocument: bloc.initialDocument } : {}),
                settings: bloc.settings ?? [],
                ...(bloc.root ? { root: bloc.root } : {}),
            }),
        }),
    );
    items.sort(compareEditorBlocs);
    return { items };
}

function canonicalJson(value: unknown): string {
    return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJson);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, sortJson(item)]),
    );
}

function compareEditorBlocs(left: CmsEditorBloc, right: CmsEditorBloc): number {
    return (
        left.group.localeCompare(right.group) ||
        left.order - right.order ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );
}
