import {
    resolveSourceMediaEffects,
    sourceEndpointAccessMode,
    type SourceEndpoint,
    type SourceMediaIdentityValue,
} from "@bernouy/cms-sources";
import { sourceImageLookupKey } from "../../identity";
import { createSourceImageJob } from "../job";
import type { SourceImageCache } from "../../../interfaces/cache";
import type { SourceImageJobScheduler } from "../../../interfaces/jobs";
import type {
    SourceImageMediaContext,
    SourceImageMediaCoordinator,
    SourceMediaAsset,
    SourceMediaAssetInput,
    SourceMediaIndex,
    SourceMediaReference,
} from "../../../interfaces/media";
import type { SourceImageRecipe } from "../../../interfaces/recipe";
import { sourceMediaAssetKey, sourceMediaGeneration, sourceMediaLogicalKey } from "./identity";
import { endpointIdentity, requestParams, sourceRequest } from "./request";

export type DefaultSourceImageMediaCoordinatorOptions = Readonly<{
    scope: string;
    index: SourceMediaIndex;
    scheduler: SourceImageJobScheduler;
    cache: SourceImageCache;
    recipe: SourceImageRecipe;
    encoderIdentity: string;
    resolveEndpoint: (sourceId: string, endpointId: string) => Promise<SourceEndpoint | null>;
    resolveInstallationId?: (sourceId: string) => Promise<string | null>;
    clock?: () => number;
}>;

export class DefaultSourceImageMediaCoordinator implements SourceImageMediaCoordinator {
    private readonly now;

    constructor(private readonly options: DefaultSourceImageMediaCoordinatorOptions) {
        this.now = options.clock ?? Date.now;
    }

    async resolveRequest(endpoint: SourceEndpoint, request: Request): Promise<SourceImageMediaContext | null> {
        const parsed = endpointIdentity(endpoint);
        if (!parsed || sourceEndpointAccessMode(endpoint) !== "public") {
            return null;
        }
        const params = requestParams(endpoint, request);
        if (!params) {
            return null;
        }
        const reference = await this.reference(parsed.sourceId, parsed.endpointId, params);
        const key = await sourceMediaAssetKey(reference);
        const existing = await this.options.index.get(key);
        if (existing) {
            return contextFor(existing);
        }
        const asset = await this.options.index.upsert(await this.assetInput(reference), this.now());
        return contextFor(asset);
    }

    async markQueued(context: SourceImageMediaContext, now: number): Promise<void> {
        await this.options.index.markQueued(context.asset.key, context.asset.generation, now);
    }

    async recordEffects(endpoint: SourceEndpoint, response: Response, request?: Request): Promise<void> {
        for (const effect of await resolveSourceMediaEffects(endpoint, response, request)) {
            const reference = await this.reference(effect.sourceId, effect.targetEndpoint, effect.params);
            const key = await sourceMediaAssetKey(reference);
            if (effect.action === "remove") {
                await this.remove(key);
                continue;
            }
            const target = await this.options.resolveEndpoint(effect.sourceId, effect.targetEndpoint);
            if (!target) {
                continue;
            }
            const before = await this.options.index.get(key);
            const input = await this.assetInput(reference, effect);
            const asset = await this.options.index.upsert(input, this.now());
            if (before?.generation === asset.generation && before.status === "ready") {
                continue;
            }
            await this.enqueue(asset, target);
        }
    }

    private async assetInput(
        reference: SourceMediaReference,
        metadata: { revision?: SourceMediaIdentityValue; width?: number; height?: number; preset?: string } = {},
    ): Promise<SourceMediaAssetInput> {
        const generation = await sourceMediaGeneration({
            reference,
            ...(metadata.revision !== undefined ? { revision: metadata.revision } : {}),
            recipeId: this.options.recipe.id,
            encoderIdentity: this.options.encoderIdentity,
        });
        const logicalKey = await sourceMediaLogicalKey(reference, generation);
        const expectedVariants = await Promise.all(
            this.options.recipe.widths.map(async (width) => ({
                width,
                lookupKey: await sourceImageLookupKey({
                    logicalKey,
                    width,
                    recipe: this.options.recipe,
                    encoderIdentity: this.options.encoderIdentity,
                }),
            })),
        );
        return {
            ...reference,
            ...metadata,
            preset: metadata.preset ?? this.options.recipe.id,
            recipeId: this.options.recipe.id,
            encoderIdentity: this.options.encoderIdentity,
            logicalKey,
            expectedVariants,
            generation,
        };
    }

    private async enqueue(asset: SourceMediaAsset, endpoint: SourceEndpoint): Promise<void> {
        const request = sourceRequest(this.options.scope, asset);
        const result = await this.options.scheduler.enqueue(
            createSourceImageJob({
                scope: this.options.scope,
                request,
                logicalKey: asset.logicalKey,
                variants: asset.expectedVariants,
                recipe: this.options.recipe,
                encoderIdentity: this.options.encoderIdentity,
                priority: "media-critical",
                asset: { key: asset.key, generation: asset.generation },
            }),
        );
        if (result === "saturated") {
            await this.options.index.markFailed(asset.key, asset.generation, "queue_saturated", this.now());
        } else {
            await this.options.index.markQueued(asset.key, asset.generation, this.now());
        }
    }

    private async reference(
        sourceId: string,
        endpointId: string,
        params: Readonly<Record<string, SourceMediaIdentityValue>>,
    ): Promise<SourceMediaReference> {
        const installationId = (await this.options.resolveInstallationId?.(sourceId)) ?? `source:${sourceId}`;
        return { scope: this.options.scope, installationId, sourceId, endpointId, params };
    }

    private async remove(key: string): Promise<void> {
        const removed = await this.options.index.remove(key);
        if (!removed) {
            return;
        }
        await Promise.all(
            removed.expectedVariants.map((variant) => this.options.cache.deleteLookup(variant.lookupKey)),
        );
        const derivatives = new Set([
            ...removed.completedVariants.map((variant) => variant.derivativeKey),
            ...removed.obsoleteDerivativeKeys,
        ]);
        await Promise.all([...derivatives].map((derivative) => this.options.cache.deleteDerivative(derivative)));
    }
}

function contextFor(asset: SourceMediaAsset): SourceImageMediaContext {
    return { asset: { key: asset.key, generation: asset.generation }, logicalKey: asset.logicalKey };
}
