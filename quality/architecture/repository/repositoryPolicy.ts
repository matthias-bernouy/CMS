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
            "packages/features/cms-content/src/browser/entries/component.entry.ts",
            "packages/features/cms-content/src/browser/entries/bindingCore.entry.ts",
            "packages/features/cms-content/src/exports/runtime/browser.ts",
            "packages/features/cms-content/src/exports/runtime/browser-dom.ts",
            "packages/features/cms-content/src/exports/bindings.ts",
            "packages/features/cms-content/src/exports/theme.ts",
            "packages/features/cms-content/src/exports/pages/path.ts",
        ],
        packageImportAllowlist: {
            "@bernouy/cms-kernel": {
                "@bernouy/cms-content": [
                    "./rendering",
                    "./bindings",
                    "./browser",
                    "./browser/dom",
                    "./http",
                    "./theme",
                    "./page-path",
                    "./kernel",
                    "./seo",
                    "./seo/http",
                ],
            },
        },
        environmentReadBaseline: ENVIRONMENT_READ_BASELINE,
    };
}
