/** Actual document producers, not exceptions for ordinary components. */
export const BINDING_OWNERS: Readonly<Record<string, string>> = {
    "packages/surfaces/cms-control/src/static/_template.html": "Owns the Control document and its page content.",
    "packages/surfaces/cms-control/src/static/editor/_template.html": "Owns the separate editor chrome document.",
    "packages/features/cms-content/src/interfaces/settings.ts":
        "wrapBindingCore produces the shared Delivery document shell.",
    "packages/surfaces/cms-control/src/api/editor/frame.get.ts": "Produces the isolated page editor frame document.",
    "packages/surfaces/cms-control/src/core/content/bloc/preview/document.ts":
        "Produces an autonomous sandboxed bloc preview document with binding disabled.",
    "packages/surfaces/cms-control/src/core/content/siteBloc/frames.ts":
        "Produces standalone composition editor and preview documents.",
};
