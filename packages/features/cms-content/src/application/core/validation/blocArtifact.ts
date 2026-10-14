import { parseHTML } from "linkedom";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { expandCompositions, type CompositionDefinition } from "cms-content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "cms-content/blocs/core/markup/bindings/source/stateGraph";
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
    validateComposedStateQueries([...catalogueBlocs, artifact], artifact);
    return artifact;
}

function validateComposedStateQueries(catalogue: readonly CompositionDefinition[], artifact: TBloc): void {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = `<${artifact.id}>${artifact.defaultContent ?? ""}</${artifact.id}>`;
    try {
        expandCompositions(document.body, catalogue);
        validateStateQueryGraph(document.body);
    } catch (error) {
        throw new ContentValidationError(
            "bloc",
            error instanceof Error ? error.message : "invalid automatic state query graph",
        );
    }
}

function pageDocumentContract(
    bloc: Pick<TBloc, "id" | "compositionHTML" | "nativeElement" | "settings" | "slots">,
): PageDocumentBlocContract {
    return {
        id: bloc.id,
        kind: bloc.compositionHTML === undefined ? "component" : "composition",
        slots: bloc.slots ?? {},
        ...(bloc.nativeElement === undefined ? {} : { nativeElement: bloc.nativeElement }),
        ...(bloc.settings === undefined ? {} : { settings: bloc.settings }),
    };
}
