import type { WorkspaceCheckOptions } from "../core/checkWorkspace";

const CONTROL_COMPONENT_ENTRY = "packages/surfaces/cms-control/src/browser/runtime.ts";
const CONTROL_RUNTIME_ASSET = "packages/surfaces/cms-control/src/browser/control-runtime.js";

/** Existing reads are frozen here until runtime configuration is injected into their owners. */
export const ENVIRONMENT_READ_BASELINE = {
    "packages/features/cms-content/src/files/http/serveFilesRequest.ts": {
        "process.env.MODE": 1,
    },
    "packages/features/cms-content/src/files/http/serveVariant.ts": {
        "process.env.MODE": 1,
    },
    "packages/foundation/http-runner/src/core/compression/headers.ts": {
        "process.env.MODE": 3,
    },
    "packages/foundation/http-runner/src/default-implementation/InMemoryCache.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-delivery/src/core/assets/buildBindingCore.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-delivery/src/core/assets/buildComponent.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-delivery/src/core/head/buildMetaCsp.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-delivery/src/runtime/DeliveryCmsContext.ts": {
        "process.env.MODE": 1,
    },
} as const;

export function repositoryArchitectureOptions(rootDir: string): WorkspaceCheckOptions {
    return {
        rootDir,
        ignoredPaths: [CONTROL_RUNTIME_ASSET],
        browserEntryPaths: [
            CONTROL_COMPONENT_ENTRY,
            "packages/features/cms-content/src/browser/index.ts",
            "packages/features/cms-content/src/browser/dom.ts",
            "packages/features/cms-content/src/exports/bindings.ts",
            "packages/features/cms-content/src/exports/theme.ts",
            "packages/features/cms-content/src/exports/page-path.ts",
            "packages/features/cms-content/src/exports/files/urls.ts",
        ],
        packageImportAllowlist: {
            "@bernouy/cms-delivery": {
                "@bernouy/cms-content": [
                    "./rendering",
                    "./bindings",
                    "./browser",
                    "./browser/dom",
                    "./theme",
                    "./page-path",
                    "./files/serving",
                    "./files/urls",
                ],
            },
        },
        environmentReadBaseline: ENVIRONMENT_READ_BASELINE,
    };
}
