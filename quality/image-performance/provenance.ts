import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { arch, cpus, hostname, platform, release } from "node:os";
import { join, relative } from "node:path";
import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import {
    IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
    type AdapterImplementation,
    type ImagePerformanceArtifact,
    type PerformanceProvenance,
    type PerformanceRuntime,
} from "./contracts";

export const IMAGE_PERFORMANCE_CODE_INPUTS = [
    "bun.lock",
    "quality/image-performance",
    "packages/foundation/components/package.json",
    "packages/foundation/components/src",
    "packages/features/cms-source-images/package.json",
    "packages/features/cms-source-images/src",
    "packages/features/cms-sources/src",
    "packages/features/cms-bloc-compile/src/core/p9rExternalsPlugin.ts",
    "packages/surfaces/cms-delivery/src/endpoints/assets/component.client.ts",
    "packages/surfaces/cms-delivery/src/core/assets/buildComponent.ts",
    "packages/surfaces/cms-delivery/src/core/assets/resolveAssets.ts",
    "packages/runtimes/cms-server/src/runtime/sourceImageTelemetry.ts",
    "packages/runtimes/cms-server/src/runtime/stores/core.ts",
    "packages/runtimes/cms-server/src/runtime/mountSurfaces.ts",
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-list/default.html",
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/blocs/commerce-offer-preview/Bloc.ts",
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/blocs/commerce-account-offers/Bloc.ts",
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/blocs/commerce-account-offers/presentation.ts",
    "packages/resources/official-integrations/integrations/domains/commerce/versions/1.0.0/blocs/commerce-account-offers/template.html",
    "packages/resources/official-integrations/integrations/extensions/commerce-negotiation/versions/1.0.0/blocs/commerce-negotiation-list/Bloc.ts",
] as const;

export function fingerprint(value: unknown): string {
    return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function fingerprintBytes(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex");
}

export function recipeFingerprint(): string {
    return fingerprint(SOURCE_RESPONSIVE_WEBP_V1);
}

export async function currentCodeFingerprint(root = process.cwd()): Promise<string> {
    const files: string[] = [];
    for (const input of IMAGE_PERFORMANCE_CODE_INPUTS) {
        await collectFiles(root, join(root, input), files);
    }
    files.sort();
    const hash = createHash("sha256");
    for (const path of files) {
        hash.update(relative(root, path));
        hash.update("\0");
        hash.update(await readFile(path));
        hash.update("\0");
    }
    return hash.digest("hex");
}

export function performanceSuiteFingerprint(
    artifact: Pick<ImagePerformanceArtifact, "corpus" | "configuration">,
    suiteId: string,
    codeFingerprint: string,
): string {
    return fingerprint({
        suiteId,
        codeFingerprint,
        corpusFingerprint: artifact.corpus.fingerprint,
        configuration: artifact.configuration,
        recipeId: SOURCE_RESPONSIVE_WEBP_V1.id,
        recipeFingerprint: recipeFingerprint(),
    });
}

export function implementationFingerprint(implementation: AdapterImplementation, codeFingerprint: string): string {
    return fingerprint({ implementation, codeFingerprint });
}

export function performanceEvidenceFingerprint(artifact: ImagePerformanceArtifact): string {
    return fingerprint(artifact);
}

export function browserEvidenceFingerprint(artifact: unknown): string {
    return fingerprint(artifact);
}

export function currentPerformanceRuntime(runtimeVersion = Bun.version): PerformanceRuntime {
    const processors = cpus();
    return {
        name: "bun",
        version: runtimeVersion,
        platform: platform(),
        architecture: arch(),
        environmentFingerprint: fingerprint({
            hostname: hostname(),
            platform: platform(),
            architecture: arch(),
            release: release(),
            processorCount: processors.length,
            processorModels: [...new Set(processors.map(({ model }) => model))].sort(),
        }),
    };
}

export function createPerformanceProvenance(options: {
    artifact: Pick<ImagePerformanceArtifact, "corpus" | "configuration" | "implementation">;
    suiteId: string;
    codeFingerprint: string;
    generatedAtMs?: number;
    runtimeVersion?: string;
}): PerformanceProvenance {
    return {
        schema: IMAGE_PERFORMANCE_PROVENANCE_SCHEMA,
        suiteId: options.suiteId,
        generatedAtMs: options.generatedAtMs ?? Date.now(),
        codeFingerprint: options.codeFingerprint,
        recipeId: SOURCE_RESPONSIVE_WEBP_V1.id,
        recipeFingerprint: recipeFingerprint(),
        suiteFingerprint: performanceSuiteFingerprint(options.artifact, options.suiteId, options.codeFingerprint),
        implementationFingerprint: implementationFingerprint(options.artifact.implementation, options.codeFingerprint),
        runtime: currentPerformanceRuntime(options.runtimeVersion),
    };
}

export function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "undefined";
}

async function collectFiles(root: string, path: string, output: string[]): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
    if (!entries) {
        output.push(path);
        return;
    }
    for (const entry of entries) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(root, child, output);
        } else if (entry.isFile() && !relative(root, child).startsWith("..")) {
            output.push(child);
        }
    }
}
