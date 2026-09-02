import type { DashboardDefinition, DashboardViewDefinition } from "@bernouy/cms-dashboards";
import type { FunctionDto } from "@bernouy/cms-functions";
import type { CmsRelation, DashboardRelationProjection } from "@bernouy/cms-relations";
import type { SourceDto, SourceOverlay } from "@bernouy/cms-sources";
import type { TriggerDto } from "@bernouy/cms-triggers";

export type DeclarativeSourceArtifactTemplate = {
    type: "source";
    source: SourceDto;
};

export type DeclarativeDashboardArtifactTemplate = {
    type: "dashboard";
    dashboard: Omit<DashboardDefinition, "origin" | "revision"> & { revision?: string };
};

export type DeclarativeDashboardViewArtifactTemplate = {
    type: "dashboard-view";
    view: DashboardViewDefinition;
};

export type DeclarativeSourceOverlayArtifactTemplate = {
    type: "sourceOverlay";
    overlay: SourceOverlay;
};

export type DeclarativeRelationArtifactTemplate = {
    type: "relation";
    relation: CmsRelation;
};

export type DeclarativeDashboardRelationProjectionArtifactTemplate = {
    type: "dashboardRelation";
    projection: DashboardRelationProjection;
};

export type DeclarativeFunctionArtifactTemplate = {
    type: "function";
    function: FunctionDto;
};

export type DeclarativeTriggerArtifactTemplate = {
    type: "trigger";
    trigger: TriggerDto;
};

export type DeclarativeBlocArtifactTemplate = {
    type: "bloc";
    bloc: {
        tag: string;
        name: string;
        group?: string;
        description?: string;
        internal?: boolean;
        path?: string;
        view?: string;
        composition?: string;
        editor?: string | null;
        viewJS?: string;
        compositionHTML?: string;
        editorJS?: string | null;
        source?: Record<string, string>;
    };
};

export type DeclarativeArtifactTemplate =
    | DeclarativeSourceArtifactTemplate
    | DeclarativeFunctionArtifactTemplate
    | DeclarativeTriggerArtifactTemplate
    | DeclarativeDashboardViewArtifactTemplate
    | DeclarativeDashboardArtifactTemplate
    | DeclarativeSourceOverlayArtifactTemplate
    | DeclarativeRelationArtifactTemplate
    | DeclarativeDashboardRelationProjectionArtifactTemplate
    | DeclarativeBlocArtifactTemplate;
