/** Actual document producers, not exceptions for ordinary components. */
export const BINDING_OWNERS: Readonly<Record<string, string>> = {
    "packages/surfaces/cms-control/src/static/_template.html": "Owns the Control document and its page content.",
    "packages/features/cms-content/src/blocs/core/markup/bindingRoot.ts":
        "wrapBindingCore produces the shared Delivery document shell.",
    "packages/surfaces/cms-control/src/core/content/bloc/preview/document.ts":
        "Produces an autonomous sandboxed bloc preview document with binding disabled.",
};
