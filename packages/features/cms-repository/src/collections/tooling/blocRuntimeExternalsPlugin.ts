import type { BunPlugin } from "bun";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Bloc bundles reuse the shared browser runtime instead of bundling it. */
export const blocRuntimeExternalsPlugin: BunPlugin = {
    name: "cms-bloc-runtime-externals",
    setup(build) {
        build.onResolve({ filter: /^@bernouy\/cms-content\/browser$/ }, (args) => ({
            path: args.path,
            namespace: "cms-bloc-runtime",
        }));

        build.onLoad({ filter: /.*/, namespace: "cms-bloc-runtime" }, (args) => {
            if (args.path === "@bernouy/cms-content/browser") {
                return {
                    contents: [
                        "export const CMS_BLOC_FORM_CONTROL_READY_EVENT = window.cmsRuntime.CMS_BLOC_FORM_CONTROL_READY_EVENT;",
                        "export const connectBlocFormControl = window.cmsRuntime.connectBlocFormControl;",
                        "export const requestBlocFormControl = window.cmsRuntime.requestBlocFormControl;",
                        "export const createBlocScope = window.cmsRuntime.createBlocScope;",
                        "export const observeBlocAttributes = window.cmsRuntime.observeBlocAttributes;",
                        "export const registerBloc = window.cmsRuntime.registerBloc;",
                        "export const mutationFormRequest = window.cmsRuntime.mutationFormRequest;",
                        "export const MutationFormError = window.cmsRuntime.MutationFormError;",
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
