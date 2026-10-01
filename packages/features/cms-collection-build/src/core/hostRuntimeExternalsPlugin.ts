import type { BunPlugin } from "bun";

/**
 * Bloc bundles must not re-bundle shared component and binding runtimes. Each
 * bundle keeps only its own view behavior and reads shared APIs from the host.
 */
export const hostRuntimeExternalsPlugin: BunPlugin = {
    name: "cms-host-runtime-externals",
    setup(build) {
        build.onResolve(
            {
                filter: /^@bernouy\/(?:components\/(?:base|binding)|cms(?:-control)?\/component|cms-gateway\/media\/browser)$/,
            },
            (args) => ({ path: args.path, namespace: "cms-host-runtime" }),
        );

        build.onLoad({ filter: /.*/, namespace: "cms-host-runtime" }, (args) => {
            if (args.path === "@bernouy/cms-gateway/media/browser") {
                return {
                    contents: [
                        "export const PROVIDER_IMAGE_WIDTHS = window.cmsRuntime.PROVIDER_IMAGE_WIDTHS;",
                        "export const buildProviderImageAttributes = window.cmsRuntime.buildProviderImageAttributes;",
                        "export const syncProviderMediaImage = window.cmsRuntime.syncProviderMediaImage;",
                    ].join("\n"),
                    loader: "js",
                };
            }
            if (args.path === "@bernouy/components/binding") {
                return {
                    contents: [
                        "export const observeSource = window.cmsRuntime.observeSource;",
                        "export const readSourceData = window.cmsRuntime.readSourceData;",
                        "export const refreshSourceContext = window.cmsRuntime.refreshSourceContext;",
                        "export const setSourceContext = window.cmsRuntime.setSourceContext;",
                        "export const sourceFormRequest = window.cmsRuntime.sourceFormRequest;",
                        "export const SourceFormError = window.cmsRuntime.SourceFormError;",
                    ].join("\n"),
                    loader: "js",
                };
            }
            if (
                args.path === "@bernouy/components/base" ||
                args.path === "@bernouy/cms/component" ||
                args.path === "@bernouy/cms-control/component"
            ) {
                return {
                    contents: "export const Component = window.cmsRuntime.Component;",
                    loader: "js",
                };
            }
            return undefined;
        });
    },
};
