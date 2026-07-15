import type { Component, Composition } from "@bernouy/components/base";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {

    var p9r: {
        readonly Component: typeof Component;
        readonly Composition: typeof Composition;
    };

}

export {};
