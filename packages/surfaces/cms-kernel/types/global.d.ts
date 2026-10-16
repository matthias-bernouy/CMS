import type {
    BlocBehavior,
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    mountBlocBehavior,
    mutationFormRequest,
    MutationFormError,
    registerBloc,
} from "@bernouy/cms-content/browser";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {
    var cmsRuntime: {
        readonly BlocBehavior: typeof BlocBehavior;
        readonly CMS_BLOC_FORM_CONTROL_READY_EVENT: typeof CMS_BLOC_FORM_CONTROL_READY_EVENT;
        readonly mountBlocBehavior: typeof mountBlocBehavior;
        readonly registerBloc: typeof registerBloc;
        readonly mutationFormRequest: typeof mutationFormRequest;
        readonly MutationFormError: typeof MutationFormError;
    };
}

export {};
