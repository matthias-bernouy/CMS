import type { FilterMap } from "../core/interpolate";
import type { Scope } from "../core/scope";
import type { CompiledCondition } from "../render/condition";
import type { RepeatSpec } from "../render/repeat";
import type { MountedRegion } from "./MountedRegion";

export type NodePath = number[];

export interface MountableTemplate {
    mount(parent: Node, scope: Scope, before?: Node | null): MountedRegion;
}

export type TextPlan = { path: NodePath; template: string };
export type AttributePlan = { path: NodePath; name: string; template: string; boolean?: true };
export type ConditionPlan = {
    path: NodePath;
    condition: CompiledCondition;
    template: MountableTemplate;
};
export type RepeatPlan = {
    path: NodePath;
    spec: RepeatSpec;
    template: MountableTemplate;
    rootCondition: CompiledCondition | null;
};
export type RawHtmlPlan = { path: NodePath; expression: string };

export type CompilePlan = {
    text: TextPlan[];
    attributes: AttributePlan[];
    conditions: ConditionPlan[];
    repeats: RepeatPlan[];
    rawHtml: RawHtmlPlan[];
};

export type CompileOptions = {
    skipRootCondition?: boolean;
    skipRootRepeat?: boolean;
    submitBoundary?: SubmitSourceBoundary | null;
};

export type SubmitSourceBoundary = { alias?: string };

export type TemplateFactory = (
    template: DocumentFragment,
    filters: FilterMap,
    options?: CompileOptions,
) => MountableTemplate;
