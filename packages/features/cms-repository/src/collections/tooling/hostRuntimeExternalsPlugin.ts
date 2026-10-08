import type { BunPlugin } from "bun";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Bloc bundles must not re-bundle the shared browser runtime. Each
 * bundle keeps only its own view behavior and reads shared APIs from the host.
 */
export const hostRuntimeExternalsPlugin: BunPlugin = {
    name: "cms-host-runtime-externals",
    setup(build) {
        build.onResolve(
            {
                filter: /^@bernouy\/cms-content\/browser$/,
            },
            (args) => ({ path: args.path, namespace: "cms-host-runtime" }),
        );

        build.onLoad({ filter: /.*/, namespace: "cms-host-runtime" }, (args) => {
            if (args.path === "@bernouy/cms-content/browser") {
                return {
                    contents: [
                        "export const Component = window.cmsRuntime.Component;",
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
