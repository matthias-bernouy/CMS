import { type Dashboard } from "@bernouy/cms-dashboards";
import { type CmsFunction } from "@bernouy/cms-functions";
import { sourceDtoToSource, type Source } from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../errors";
import { resolveTemplate, resolveTemplates, type TemplateContext } from "../../templates";
import type {
    DeclarativeBlocArtifactTemplate,
    IntegrationDefinition,
} from "../../../interfaces/Integration";
import type { IntegrationBlocArtifact } from "../../../interfaces/IntegrationImport";

export function buildSourceArtifacts(definition: IntegrationDefinition, context: TemplateContext): Source[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "source")
            .map(artifact => sourceDtoToSource(resolveTemplates(artifact.source, context)));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid source artifact");
    }
}

export function buildFunctionArtifacts(definition: IntegrationDefinition, context: TemplateContext): CmsFunction[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "function")
            .map(artifact => resolveTemplates(artifact.function, context));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid function artifact");
    }
}

export function buildDashboardArtifacts(definition: IntegrationDefinition, context: TemplateContext): Dashboard[] {
    try {
        return (definition.artifacts ?? [])
            .filter(artifact => artifact.type === "dashboard")
            .map(artifact => resolveTemplates(artifact.dashboard, context));
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid dashboard artifact");
    }
}

export function buildBlocArtifacts(definition: IntegrationDefinition, context: TemplateContext): IntegrationBlocArtifact[] {
    try {
        return (definition.artifacts ?? [])
            .filter((artifact): artifact is DeclarativeBlocArtifactTemplate => artifact.type === "bloc")
            .map(artifact => {
                const tag = resolveTemplate(artifact.bloc.tag, context);
                const name = resolveTemplate(artifact.bloc.name, context);
                if (!artifact.bloc.viewJS) {
                    throw new IntegrationInputError("artifacts", `bloc "${tag}" is missing viewJS`);
                }
                return {
                    tag,
                    name,
                    ...(artifact.bloc.group ? { group: resolveTemplate(artifact.bloc.group, context) } : {}),
                    ...(artifact.bloc.description ? { description: resolveTemplate(artifact.bloc.description, context) } : {}),
                    viewJS: artifact.bloc.viewJS,
                    ...(artifact.bloc.editorJS !== undefined ? { editorJS: artifact.bloc.editorJS } : {}),
                    ...(artifact.bloc.source ? { source: artifact.bloc.source } : {}),
                };
            });
    } catch (error) {
        if (error instanceof IntegrationInputError) throw error;
        throw new IntegrationInputError("artifacts", error instanceof Error ? error.message : "invalid bloc artifact");
    }
}
