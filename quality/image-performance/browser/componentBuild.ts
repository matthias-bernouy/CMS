import { readFile } from "node:fs/promises";
import { fingerprintBytes } from "../provenance";

const COMPONENT_CLIENT_ENTRY = new URL(
    "../../../packages/surfaces/cms-delivery/src/endpoints/assets/component.client.ts",
    import.meta.url,
).pathname;

export type CurrentComponentBuild = {
    entryFingerprint: string;
    enabledBundleFingerprint: string;
    disabledBundleFingerprint: string;
};

export type BrowserComponentBuild = CurrentComponentBuild & {
    enabledScript: string;
    disabledScript: string;
};

export const BROWSER_COMPONENT_ROLLOUT = {
    enabled: { public: true, private: false },
    disabled: { public: false, private: false },
} as const;

export async function buildCurrentBrowserComponent(): Promise<BrowserComponentBuild> {
    const [entry, enabledScript, disabledScript] = await Promise.all([
        readFile(COMPONENT_CLIENT_ENTRY),
        buildProductionComponentScript(BROWSER_COMPONENT_ROLLOUT.enabled),
        buildProductionComponentScript(BROWSER_COMPONENT_ROLLOUT.disabled),
    ]);
    return {
        entryFingerprint: fingerprintBytes(entry),
        enabledBundleFingerprint: fingerprintBytes(enabledScript),
        disabledBundleFingerprint: fingerprintBytes(disabledScript),
        enabledScript,
        disabledScript,
    };
}

async function buildProductionComponentScript(
    rollout: (typeof BROWSER_COMPONENT_ROLLOUT)[keyof typeof BROWSER_COMPONENT_ROLLOUT],
): Promise<string> {
    const build = await Bun.build({
        entrypoints: [COMPONENT_CLIENT_ENTRY],
        format: "iife",
        define: {
            __CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED__: String(rollout.public),
            __CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED__: String(rollout.private),
        },
    });
    if (!build.success || !build.outputs[0]) {
        throw new Error(
            `Unable to bundle the production component runtime with responsive images ${JSON.stringify(rollout)}`,
        );
    }
    return build.outputs[0].text();
}
