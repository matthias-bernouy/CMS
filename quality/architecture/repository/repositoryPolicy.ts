import type { WorkspaceCheckOptions } from "../core/checkWorkspace";

const ADMIN_COMPONENT_ENTRY = "packages/surfaces/cms-kernel/src/browser/runtime.ts";
const ADMIN_RUNTIME_ASSET = "packages/surfaces/cms-kernel/src/browser/admin-runtime.js";

/** Existing reads are frozen here until runtime configuration is injected into their owners. */
export const ENVIRONMENT_READ_BASELINE = {
    "packages/foundation/http-runner/src/core/compression/headers.ts": {
        "process.env.MODE": 3,
    },
    "packages/foundation/http-runner/src/default-implementation/InMemoryCache.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-kernel/src/core/assets/buildBindingCore.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-kernel/src/core/assets/buildComponent.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-kernel/src/core/head/buildMetaCsp.ts": {
        "process.env.MODE": 1,
    },
    "packages/surfaces/cms-kernel/src/runtime/KernelCmsContext.ts": {
        "process.env.MODE": 1,
    },
} as const;

export function repositoryArchitectureOptions(rootDir: string): WorkspaceCheckOptions {
    return {
        rootDir,
        ignoredPaths: [ADMIN_RUNTIME_ASSET],
        browserEntryPaths: [
            ADMIN_COMPONENT_ENTRY,
            "packages/features/cms-content/src/browser/index.ts",
            "packages/features/cms-content/src/browser/dom.ts",
            "packages/features/cms-content/src/exports/bindings.ts",
            "packages/features/cms-content/src/exports/theme.ts",
            "packages/features/cms-content/src/exports/page-path.ts",
        ],
        packageImportAllowlist: {
            "@bernouy/cms-kernel": {
                "@bernouy/cms-content": [
                    "./rendering",
                    "./bindings",
                    "./browser",
                    "./browser/dom",
                    "./theme",
                    "./page-path",
                    "./kernel",
                ],
            },
        },
        environmentReadBaseline: ENVIRONMENT_READ_BASELINE,
    };
}
