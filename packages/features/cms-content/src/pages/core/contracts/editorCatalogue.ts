import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import type { PageSurface } from "@bernouy/cms-repository/collections";

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
    repository: Pick<CmsRepository, "getBlocsList">,
    input: { readonly surface: PageSurface },
): Promise<CmsEditorCatalogue> {
    if (input.surface !== "control" && input.surface !== "delivery") {
        throw new TypeError("Invalid editor surface.");
    }
    const blocs = await repository.getBlocsList();
    const items = blocs
        .filter(({ internal, surfaces }) => !internal && (surfaces ?? ["control", "delivery"]).includes(input.surface))
        .map(
            (bloc): CmsEditorBloc => ({
                id: bloc.id,
                name: bloc.name,
                group: bloc.group,
                description: bloc.description,
                kind: bloc.compositionHTML ? "composition" : "component",
                ownership: bloc.ownership.kind,
                order: bloc.catalogueOrder ?? 0,
                defaultContent: bloc.defaultContent ?? "",
                authoringJson: canonicalizeIJson({
                    slots: bloc.collectionSlots ?? {},
                    settings: bloc.collectionSettings ?? [],
                    ...(bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
                }),
            }),
        );
    items.sort(compareEditorBlocs);
    return { items };
}

function compareEditorBlocs(left: CmsEditorBloc, right: CmsEditorBloc): number {
    return (
        left.group.localeCompare(right.group) ||
        left.order - right.order ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );
}
