import type { VerifiedCollectionReleaseMetadata } from "../../../interfaces/CollectionAdmission";
import { createHash } from "node:crypto";
import { canonicalIJsonBytes, canonicalizeIJson, deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { inlineCollectionVerifier } from "../../../sources/verification";
import { collectionBrowserRisk, collectionBrowserRiskDigest } from "../../../core/validation/browserCapabilities";
import { assertCollectionResourceIsolation } from "../../core/resourceIsolation";
import { invalid } from "../../../core/errors";
import { initializationLimits } from "../limits";
import { initializationGraph } from "./graph";
import { initializationRoot } from "./root";
import { initializationRequirements } from "./requirements";
import type { CollectionInitializationPlan, InitializationOptions, InitializationRelease } from "../interfaces";

/** Bounded metadata-only analysis. Asset verification and authority belong to application. */
export async function planCollectionInitialization(
    requestedRoot: unknown,
    inputs: readonly InitializationRelease[],
    options: InitializationOptions,
): Promise<CollectionInitializationPlan> {
    const limits = initializationLimits(options.limits);
    if (
        !Array.isArray(inputs) ||
        inputs.length > limits.maxCollections ||
        options.selected.length > limits.maxContracts
    ) {
        invalid("initialization graph exceeds its resource limits", "$.collections");
    }
    if (canonicalIJsonBytes(inputs, 64).byteLength > limits.maxMetadataBytes) {
        invalid("initialization metadata exceeds its byte limit", "$.collections");
    }
    const entries = new Map<string, VerifiedCollectionReleaseMetadata>();
    let assetBytes = 0;
    for (const input of inputs) {
        options.signal?.throwIfAborted();
        const entry = await (options.verifier ?? inlineCollectionVerifier).metadata(
            input.release,
            input.digest,
            options.signal,
        );
        if (entries.has(entry.release.collectionId)) {
            invalid("duplicate initialization collection", "$.collections");
        }
        entries.set(entry.release.collectionId, entry);
        assetBytes += entry.release.assets.reduce((sum, asset) => sum + asset.byteLength, 0);
        if (assetBytes > limits.maxDeclaredAssetBytes) {
            invalid("initialization assets exceed their aggregate limit", "$.collections");
        }
    }
    const root = requestedRoot === null ? null : initializationRoot(requestedRoot);
    if (!root && entries.size) {
        invalid("empty initialization cannot include collections", "$.collections");
    }
    const locale = options.locale ?? (root ? entries.get(root.collectionId)?.release.locale : "en") ?? "en";
    if (typeof locale !== "string" || locale.length > 64 || Intl.getCanonicalLocales(locale)[0] !== locale) {
        invalid("invalid initialization locale", "$.locale");
    }
    const graph = root
        ? initializationGraph(root, entries, locale, limits)
        : { collections: [], pages: [], requirements: [] };
    const releases = graph.collections.map(({ release }) => release);
    if (graph.collections.length !== entries.size) {
        invalid("initialization contains unrelated releases", "$.collections");
    }
    assertCollectionResourceIsolation(releases);
    const execution = initializationRequirements(graph.pages, graph.requirements, releases, options.selected);
    if (
        execution.requirements.some((requirement) =>
            options.denied?.some(
                (denied) =>
                    denied.contractId === requirement.contractId && denied.capabilityId === requirement.capabilityId,
            ),
        )
    ) {
        invalid("a bootstrap capability is denied by the site execution policy", "$.requirements");
    }
    const result = {
        protocol: "ulvia-initialization-plan/v1" as const,
        root,
        locale,
        collections: graph.collections.map(({ release, digest }) => {
            const browserRisk = collectionBrowserRisk(release);
            return {
                publisherId: release.publisherId,
                collectionId: release.collectionId,
                version: release.version,
                digest,
                browserRisk,
                browserRiskDigest: collectionBrowserRiskDigest(browserRisk),
            };
        }),
        ...execution,
        pages: graph.pages,
    };
    return deepFreeze({ ...result, digest: initializationDigest(result) });
}

export function initializationDigest(value: unknown): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(value)).digest("hex")}`;
}
