import type { WorkspaceCheckOptions } from "../core/checkWorkspace";
import {
    CONTROL_COMPONENT_ASSET,
    CONTROL_COMPONENT_ENTRY,
    generateControlComponentAsset,
    normalizeControlAsset,
} from "../control/controlAsset";

/** Existing reads are frozen here until runtime configuration is injected into their owners. */
export const ENVIRONMENT_READ_BASELINE = {
    "packages/features/cms-files/src/http/serveFilesRequest.ts": {
        "process.env.MODE": 1,
    },
    "packages/features/cms-files/src/http/serveVariant.ts": {
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
        ignoredPaths: [CONTROL_COMPONENT_ASSET],
        browserEntryPaths: [CONTROL_COMPONENT_ENTRY],
        environmentReadBaseline: ENVIRONMENT_READ_BASELINE,
        generatedAssets: [
            {
                path: CONTROL_COMPONENT_ASSET,
                generate: () => generateControlComponentAsset(rootDir),
                normalize: normalizeControlAsset,
            },
        ],
    };
}
