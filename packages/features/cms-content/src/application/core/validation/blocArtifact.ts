import { parseHTML } from "linkedom";
import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { expandCompositions, type CompositionDefinition } from "cms-content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "cms-content/blocs/core/markup/bindings/operation/stateGraph";
import { validateBlocDocument } from "cms-content/blocs/core/markup/validation/documents/blocDocument";
import type { PageDocumentBlocContract } from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import type { TBloc, TBlocWrite } from "cms-content/blocs/interfaces/blocs";
import { validateBlocWrite } from "cms-content/blocs/core/validation";
import { assertAcyclicBlocDependencies } from "cms-content/blocs/core/markup/validation/documents/blocDependencyGraph";
import {
    resolveBindingAnalysisOptions,
    type ContentBindingValidationOptions,
} from "cms-content/application/core/validation/bindingCapabilities";

type BlocCatalogueReader = Pick<CmsRepository, "getBlocsList">;

export async function validateBlocArtifact(
    repository: BlocCatalogueReader,
    value: TBlocWrite,
    bindingOptions: ContentBindingValidationOptions = {},
): Promise<TBloc> {
    const bloc = validateBlocWrite(value);
    const catalogueBlocs = (await repository.getBlocsList({ includeInactive: true })).filter(
        ({ id }) => id !== bloc.id,
    );
    const catalogue = catalogueBlocs.map(pageDocumentContract);
    const contract = pageDocumentContract(bloc);
    const validated = validateBlocDocument(
        {
            ...contract,
            ...(bloc.compositionHTML === undefined && bloc.templateHTML === undefined
                ? {}
                : { fixedContent: bloc.compositionHTML ?? bloc.templateHTML }),
            ...(bloc.defaultContent === undefined ? {} : { defaultContent: bloc.defaultContent }),
        },
        catalogue,
    );
    if (
        bindingOptions.resolveCapabilities ||
        bindingOptions.resolveQueryCapabilities ||
        bindingOptions.requireQueryCapabilityResolution
    ) {
        validateBlocDocument(
            {
                ...contract,
                ...(validated.fixedContent === undefined ? {} : { fixedContent: validated.fixedContent }),
                ...(validated.defaultContent === undefined ? {} : { defaultContent: validated.defaultContent }),
            },
            catalogue,
            [],
            await resolveBindingAnalysisOptions(validated.queries, validated.mutations, bindingOptions),
        );
    }
    const artifact: TBloc = {
        ...bloc,
        ...(validated.fixedContent === undefined
            ? {}
            : bloc.compositionHTML === undefined
              ? { templateHTML: validated.fixedContent }
              : { compositionHTML: validated.fixedContent }),
        ...(validated.defaultContent === undefined ? {} : { defaultContent: validated.defaultContent }),
    };
    assertAcyclicBlocDependencies([...catalogueBlocs, artifact]);
    validateComposedStateQueries([...catalogueBlocs, artifact], artifact);
    return artifact;
}

function validateComposedStateQueries(catalogue: readonly CompositionDefinition[], artifact: TBloc): void {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    const rootTag = artifact.root.accepts[0] ?? "div";
    document.body.innerHTML = `<${rootTag} cms-bloc="${artifact.id}">${artifact.defaultContent ?? ""}</${rootTag}>`;
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
    bloc: Pick<TBloc, "id" | "compositionHTML" | "root" | "content" | "settings" | "slots">,
): PageDocumentBlocContract {
    return {
        id: bloc.id,
        kind: bloc.compositionHTML === undefined ? "component" : "composition",
        slots: bloc.slots ?? {},
        root: bloc.root,
        ...(bloc.content === undefined ? {} : { content: bloc.content }),
        ...(bloc.settings === undefined ? {} : { settings: bloc.settings }),
    };
}
