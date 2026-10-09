import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { validateBlocDocument } from "cms-content/blocs/core/markup/validation/documents/blocDocument";
import type { PageDocumentBlocContract } from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import type { TBloc, TBlocWrite } from "cms-content/blocs/interfaces/blocs";
import { validateBlocWrite } from "cms-content/blocs/core/validation";

type BlocCatalogueReader = Pick<CmsRepository, "getBlocsList">;

export async function validateBlocArtifact(repository: BlocCatalogueReader, value: TBlocWrite): Promise<TBloc> {
    const bloc = validateBlocWrite(value);
    const catalogue = (await repository.getBlocsList({ includeInactive: true }))
        .filter(({ id }) => id !== bloc.id)
        .map(pageDocumentContract);
    const contract = pageDocumentContract(bloc);
    const validated = validateBlocDocument(
        {
            ...contract,
            ...(bloc.compositionHTML === undefined && bloc.componentHTML === undefined
                ? {}
                : { fixedContent: bloc.compositionHTML ?? bloc.componentHTML }),
            ...(bloc.defaultContent === undefined ? {} : { defaultContent: bloc.defaultContent }),
        },
        catalogue,
    );
    return {
        ...bloc,
        ...(validated.fixedContent === undefined
            ? {}
            : bloc.compositionHTML === undefined
              ? { componentHTML: validated.fixedContent }
              : { compositionHTML: validated.fixedContent }),
        ...(validated.defaultContent === undefined ? {} : { defaultContent: validated.defaultContent }),
    };
}

function pageDocumentContract(
    bloc: Pick<TBloc, "id" | "compositionHTML" | "nativeElement" | "settings" | "slots" | "surfaces">,
): PageDocumentBlocContract {
    return {
        id: bloc.id,
        kind: bloc.compositionHTML === undefined ? "component" : "composition",
        slots: bloc.slots ?? {},
        ...(bloc.nativeElement === undefined ? {} : { nativeElement: bloc.nativeElement }),
        ...(bloc.settings === undefined ? {} : { settings: bloc.settings }),
        ...(bloc.surfaces === undefined ? {} : { surfaces: bloc.surfaces }),
    };
}
