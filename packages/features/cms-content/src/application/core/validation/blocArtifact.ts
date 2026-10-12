import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { validateBlocDocument } from "cms-content/blocs/core/markup/validation/documents/blocDocument";
import type { PageDocumentBlocContract } from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import type { TBloc, TBlocWrite } from "cms-content/blocs/interfaces/blocs";
import { validateBlocWrite } from "cms-content/blocs/core/validation";
import { assertAcyclicBlocDependencies } from "cms-content/blocs/core/markup/validation/documents/blocDependencyGraph";

type BlocCatalogueReader = Pick<CmsRepository, "getBlocsList">;

export async function validateBlocArtifact(repository: BlocCatalogueReader, value: TBlocWrite): Promise<TBloc> {
    const bloc = validateBlocWrite(value);
    const catalogueBlocs = (await repository.getBlocsList({ includeInactive: true })).filter(
        ({ id }) => id !== bloc.id,
    );
    const catalogue = catalogueBlocs.map(pageDocumentContract);
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
    const artifact: TBloc = {
        ...bloc,
        ...(validated.fixedContent === undefined
            ? {}
            : bloc.compositionHTML === undefined
              ? { componentHTML: validated.fixedContent }
              : { compositionHTML: validated.fixedContent }),
        ...(validated.defaultContent === undefined ? {} : { defaultContent: validated.defaultContent }),
    };
    assertAcyclicBlocDependencies([...catalogueBlocs, artifact]);
    return artifact;
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
