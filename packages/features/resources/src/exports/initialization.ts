export { prepareResourceInitialization, resourceBrowserRisk } from "resources/initialization/review";
export {
    pendingResourceInitialization,
    parseResourceInitializationState,
    parseResourceReview,
    emptyResourceProgress,
} from "resources/initialization/state";
export type {
    ResourceInitializationOptions,
    ResourceInitializationStateStore,
    ResourceInitializationIntents,
    ResourceInitializationIntent,
    ResourceInitializationRetainer,
    ResourceInitializationExecution,
    ResourceInitializationGuard,
    ResourceInitializationPreview,
    ResourceCopyPorts,
    ResourceCopyProgress,
} from "resources/initialization/interfaces";
export type {
    ResourceInitializationReview,
    ResourceInitializationState,
    ResourceInitializationProgress,
    ResourcePreviewPage,
} from "resources/initialization/schemas";

export { copyResourceContent } from "resources/initialization/execution/copy";
export { mergeResourceTheme } from "resources/initialization/execution/theme";

export { ResourceInitializationService } from "resources/initialization/lifecycle/service";
export { assertResourceRequirements } from "resources/initialization/lifecycle/requirements";
