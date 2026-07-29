import type { SourceMediaIdentityValue } from "@bernouy/cms-sources";
import type { SourceImageWidth } from "./recipe";

export type SourceMediaReference = Readonly<{
    scope: string;
    installationId: string;
    sourceId: string;
    endpointId: string;
    params: Readonly<Record<string, SourceMediaIdentityValue>>;
}>;

export type SourceMediaAssetInput = SourceMediaReference &
    Readonly<{
        revision?: SourceMediaIdentityValue;
        width?: number;
        height?: number;
        preset: string;
        recipeId: string;
        encoderIdentity: string;
        logicalKey: string;
        expectedVariants: readonly SourceMediaExpectedVariant[];
        generation: string;
    }>;

export type SourceMediaExpectedVariant = Readonly<{
    width: SourceImageWidth;
    lookupKey: string;
}>;

export type SourceMediaCompletedVariant = SourceMediaExpectedVariant &
    Readonly<{
        derivativeKey: string;
    }>;

export type SourceMediaAssetStatus = "queued" | "processing" | "ready" | "failed";

export type SourceMediaAsset = SourceMediaAssetInput &
    Readonly<{
        key: string;
        completedVariants: readonly SourceMediaCompletedVariant[];
        obsoleteDerivativeKeys: readonly string[];
        status: SourceMediaAssetStatus;
        createdAt: number;
        updatedAt: number;
        error?: string;
    }>;

export interface SourceMediaIndex {
    upsert(asset: SourceMediaAssetInput, now: number): Promise<SourceMediaAsset>;
    get(key: string): Promise<SourceMediaAsset | null>;
    remove(key: string): Promise<SourceMediaAsset | null>;
    markQueued(key: string, generation: string, now: number): Promise<boolean>;
    markProcessing(key: string, generation: string, now: number): Promise<boolean>;
    markReady(
        key: string,
        generation: string,
        variants: readonly SourceMediaCompletedVariant[],
        now: number,
    ): Promise<boolean>;
    markFailed(key: string, generation: string, error: string, now: number): Promise<boolean>;
    isCurrent(key: string, generation: string): Promise<boolean>;
    takeObsoleteDerivativeKeys(key: string, generation: string): Promise<readonly string[]>;
}

export type SourceImageMediaContext = Readonly<{
    asset: Readonly<{ key: string; generation: string }>;
    logicalKey: string;
}>;

export interface SourceImageMediaCoordinator {
    resolveRequest(
        endpoint: import("@bernouy/cms-sources").SourceEndpoint,
        request: Request,
    ): Promise<SourceImageMediaContext | null>;
    markQueued(context: SourceImageMediaContext, now: number): Promise<void>;
}
