import type { BunPlugin } from "bun";
import { isAbsolute, relative, resolve, sep } from "node:path";

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

/** Prevent a collection compiler invocation from reading host files or dependencies. */
export function collectionSourceBoundaryPlugin(sourceRoot: string): BunPlugin {
    const root = resolve(sourceRoot);
    return {
        name: "cms-collection-source-boundary",
        setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
                if (isAbsolute(args.path)) {
                    assertInsideSourceRoot(root, resolve(args.path), args.path);
                    return undefined;
                }
                if (!args.path.startsWith(".")) {
                    throw new Error(
                        `Bloc imports may only use bundled relative sources or approved host APIs: ${args.path}`,
                    );
                }
                const candidate = resolve(args.resolveDir, args.path);
                assertInsideSourceRoot(root, candidate, args.path);
                return undefined;
            });
        },
    };
}

function assertInsideSourceRoot(root: string, candidate: string, importPath: string): void {
    const fromRoot = relative(root, candidate);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
        throw new Error(`Bloc import escapes its source bundle: ${importPath}`);
    }
}
