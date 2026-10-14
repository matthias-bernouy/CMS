import type { Component } from "@bernouy/cms-content/browser";
import type { sourceFormRequest, SourceFormError } from "@bernouy/cms-content/browser";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {
    var cmsRuntime: {
        readonly Component: typeof Component;
        readonly sourceFormRequest: typeof sourceFormRequest;
        readonly SourceFormError: typeof SourceFormError;
    };
}

export {};
