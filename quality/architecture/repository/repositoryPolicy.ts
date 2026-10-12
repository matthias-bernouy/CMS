import type { WorkspaceCheckOptions } from "../core/checkWorkspace";

/** Existing reads are frozen here until runtime configuration is injected into their owners. */
export const ENVIRONMENT_READ_BASELINE = {
    "packages/foundation/http-runner/src/core/compression/headers.ts": {
        "process.env.MODE": 3,
    },
    "packages/foundation/http-runner/src/default-implementation/InMemoryCache.ts": {
        "process.env.MODE": 1,
    },
} as const;

export function repositoryArchitectureOptions(rootDir: string): WorkspaceCheckOptions {
    return {
        rootDir,
        browserEntryPaths: [
            "packages/surfaces/cms-kernel/src/endpoints/assets/component.client.ts",
            "packages/surfaces/cms-kernel/src/endpoints/assets/bindingCore.client.ts",
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
