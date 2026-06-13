import type { Component } from "@bernouy/components/base";
import { P9R_ATTR } from "@bernouy/cms-content";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {

    var p9r: {
        readonly attr:  typeof P9R_ATTR;
        readonly Component: typeof Component;
    };

}

export {};
