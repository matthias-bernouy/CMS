import type { DataShape, SourceRepository } from "@bernouy/cms-sources";
import type { CmsFunction } from "../../interfaces/FunctionDefinition";

export type ValidateFunctionOptions = {
    sources?: SourceRepository | null;
    maxCalls?: number;
};

export type ValidationState = {
    fn: CmsFunction;
    options: ValidateFunctionOptions;
    errors: string[];
    stepIds: Set<string>;
    knownStepIds: Set<string>;
    stepShapes: Map<string, DataShape | null>;
};

export const MAX_LOOP_ITEMS = 50;
