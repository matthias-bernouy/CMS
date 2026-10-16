import type {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    createBlocScope,
    mutationFormRequest,
    MutationFormError,
    observeBlocAttributes,
    registerBloc,
} from "@bernouy/cms-content/browser";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {
    var cmsRuntime: {
        readonly CMS_BLOC_FORM_CONTROL_READY_EVENT: typeof CMS_BLOC_FORM_CONTROL_READY_EVENT;
        readonly connectBlocFormControl: typeof connectBlocFormControl;
        readonly createBlocScope: typeof createBlocScope;
        readonly observeBlocAttributes: typeof observeBlocAttributes;
        readonly registerBloc: typeof registerBloc;
        readonly mutationFormRequest: typeof mutationFormRequest;
        readonly MutationFormError: typeof MutationFormError;
    };
}

export {};
