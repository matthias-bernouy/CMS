import { readFile } from "node:fs/promises";
import { fingerprintBytes } from "../provenance";

const COMPONENT_CLIENT_ENTRY = new URL(
    "../../../packages/surfaces/cms-delivery/src/endpoints/assets/component.client.ts",
    import.meta.url,
).pathname;

export type CurrentComponentBuild = {
    entryFingerprint: string;
    bundleFingerprint: string;
};

export type BrowserComponentBuild = CurrentComponentBuild & {
    script: string;
};

export async function buildCurrentBrowserComponent(): Promise<BrowserComponentBuild> {
    const [entry, script] = await Promise.all([readFile(COMPONENT_CLIENT_ENTRY), buildProductionComponentScript()]);
    return {
        entryFingerprint: fingerprintBytes(entry),
        bundleFingerprint: fingerprintBytes(script),
        script,
    };
}

async function buildProductionComponentScript(): Promise<string> {
    const build = await Bun.build({
        entrypoints: [COMPONENT_CLIENT_ENTRY],
        format: "iife",
    });
    if (!build.success || !build.outputs[0]) {
        throw new Error("Unable to bundle the production component runtime");
    }
    return build.outputs[0].text();
}
