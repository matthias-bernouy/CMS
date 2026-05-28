import type { BunPlugin } from "bun";

/**
 * Bloc bundles must not re-bundle `@bernouy/cms/component` or
 * `/editor`. Those base classes are shipped once per page via
 * `src/core/global.ts`, which installs them on `window.p9r`. This plugin
 * rewrites the two import specifiers to read from that global, so each
 * bloc's compiled JS contains only its own code.
 */
export const p9rExternalsPlugin: BunPlugin = {
    name: "p9r-externals",
    setup(build) {
        build.onResolve(
            { filter: /^@bernouy\/cms\/(component|editor)$/ },
            (args) => ({ path: args.path, namespace: "p9r-extern" }),
        );

        build.onLoad(
            { filter: /.*/, namespace: "p9r-extern" },
            (args) => {
                if (args.path === "@bernouy/cms/component") {
                    return {
                        contents: `export const Component = window.p9r.Component;`,
                        loader: "js",
                    };
                }
                // The shim lives inside each bloc bundle, so the post-build
                // `.replaceAll("BE5_*_TO_BE_REPLACED", ...)` in build.ts /
                // prepare_bloc.ts substitutes the placeholders per-bloc before
                // they hit the canonical window.p9r.registerEditor.
                return {
                    contents:
                        `export const Editor = window.p9r.Editor;\n` +
                        `export const registerEditor = (props) => window.p9r.registerEditor({\n` +
                        `    ...props,\n` +
                        `    tag:   "BE5_TAG_TO_BE_REPLACED",\n` +
                        `    label: "BE5_LABEL_TO_BE_REPLACED",\n` +
                        `    group: "BE5_GROUP_TO_BE_REPLACED",\n` +
                        `});\n` +
                        `export const registerEditor_opaque = () => window.p9r.registerEditor_opaque({\n` +
                        `    tag:   "BE5_TAG_TO_BE_REPLACED",\n` +
                        `    label: "BE5_LABEL_TO_BE_REPLACED",\n` +
                        `    group: "BE5_GROUP_TO_BE_REPLACED",\n` +
                        `});\n`,
                    loader: "js",
                };
            },
        );
    },
};
