import type { BunPlugin } from "bun";

/**
 * Bloc bundles must not re-bundle component/editor base classes. The view side
 * reads `Component` from `window.p9r`; the editor catalog side reads the stable
 * editor API from `window.p9rEditor`. Each bloc bundle keeps only its own code.
 */
export const p9rExternalsPlugin: BunPlugin = {
    name: "p9r-externals",
    setup(build) {
        build.onResolve(
            { filter: /^@bernouy\/(?:components\/base|cms(?:-control)?\/component|cms-content\/editor|cms(?:-control)?\/editor)$/ },
            (args) => ({ path: args.path, namespace: "p9r-extern" }),
        );

        build.onLoad(
            { filter: /.*/, namespace: "p9r-extern" },
            (args) => {
                if (
                    args.path === "@bernouy/components/base" ||
                    args.path === "@bernouy/cms/component" ||
                    args.path === "@bernouy/cms-control/component"
                ) {
                    return {
                        contents: `export const Component = window.p9r.Component;`,
                        loader: "js",
                    };
                }
                return {
                    contents:
                        `export const Editor = window.p9rEditor.Editor;\n` +
                        `export const registerEditor = (props) => window.p9rEditor.registerEditor({\n` +
                        `    ...props,\n` +
                        `    tag:         props?.tag ?? "BE5_TAG_TO_BE_REPLACED",\n` +
                        `    label:       props?.label ?? "BE5_LABEL_TO_BE_REPLACED",\n` +
                        `    description: props?.description ?? "BE5_DESCRIPTION_TO_BE_REPLACED",\n` +
                        `    category:    props?.category ?? "BE5_GROUP_TO_BE_REPLACED",\n` +
                        `    editor:      props?.editor ?? props?.cl,\n` +
                        `});\n`,
                    loader: "js",
                };
            },
        );
    },
};
