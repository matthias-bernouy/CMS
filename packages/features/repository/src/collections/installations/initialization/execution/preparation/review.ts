import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import {
    planCollectionInitialization,
    initializationDigest,
} from "repository/collections/installations/initialization/planning/plan";
import { inlineCollectionVerifier } from "repository/collections/sources/verification";
import type { AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import type {
    InitializationReview,
    InitializationServiceOptions,
} from "repository/collections/installations/initialization/execution/interfaces";
import {
    assertEmptyInitialization,
    assertInitializationRoutesAvailable,
    initializationError,
    readInitialization,
    assertPreparationUnchanged,
} from "repository/collections/installations/initialization/execution/state";
import { resolveInitializationGraph } from "./catalogue";
import { DEFAULT_INITIALIZATION_LIMITS } from "repository/collections/installations/initialization/limits";
import { collectionVerificationScope } from "repository/collections/sources/verificationScope";
import { InitializationPreparationCache } from "./reuse/preparations";

export async function prepareInitialization(
    options: InitializationServiceOptions,
    actorId: string,
    root: unknown,
    locale?: string,
    callerSignal?: AbortSignal,
    reuse = new InitializationPreparationCache(),
) {
    const signal = callerSignal
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(60_000)])
        : AbortSignal.timeout(60_000);
    signal.throwIfAborted();
    const verifier = collectionVerificationScope(
        reuse.artifacts.verifier(options.verifier ?? inlineCollectionVerifier),
        DEFAULT_INITIALIZATION_LIMITS.maxCollections,
        DEFAULT_INITIALIZATION_LIMITS.maxMetadataBytes,
    );
    const state = await readInitialization(options);
    if (state.status !== "pending") {
        throw initializationError("Initialization was already started", 409);
    }
    const snapshot = await assertEmptyInitialization(options);
    const execution = await options.execution();
    const graph =
        root === null
            ? { root: null, metadata: [] }
            : await resolveInitializationGraph(reuse.source(options.source), root, signal, verifier);
    const key =
        snapshot.siteBlocsRevision === null
            ? undefined
            : initializationDigest({
                  instanceId: options.instanceId,
                  siteId: options.siteId,
                  revision: state.revision,
                  root: graph.root,
                  locale:
                      locale ??
                      graph.metadata.find((entry) => entry.release.collectionId === graph.root?.collectionId)?.release
                          .locale ??
                      "en",
                  digests: graph.metadata.map((entry) => entry.digest).sort(),
                  snapshot,
                  execution: execution.fingerprint,
                  generation: reuse.artifacts.generation,
              });
    const cached = reuse.get(key);
    const plan =
        cached ??
        (await planCollectionInitialization(graph.root, graph.metadata, {
            selected: execution.selected,
            verifier,
            validateResources: verifier.validateResources,
            denied: execution.denied,
            locale,
            signal,
        }));
    await assertInitializationRoutesAvailable(
        options,
        plan.pages.map(({ path }) => path),
    );
    const artifacts: AdmittedCollectionRelease[] = [];
    let remainingBytes = DEFAULT_INITIALIZATION_LIMITS.maxDeclaredAssetBytes;
    for (const pin of plan.collections) {
        let artifact = reuse.artifacts.get(pin)?.artifact;
        if (!artifact) {
            const metadata = graph.metadata.find((entry) => entry.digest === pin.digest);
            const bundle = await options.source.get(pin, {
                maxAssetBytes: remainingBytes,
                signal,
                metadata: metadata?.release,
                verifier,
            });
            artifact = await verifier.artifact(bundle.release, bundle.assets, pin.digest, signal);
            reuse.artifacts.remember(artifact);
        }
        remainingBytes -= artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
        if (remainingBytes < 0) {
            throw initializationError("Initialization asset budget exceeded");
        }
        artifacts.push(artifact);
    }
    signal.throwIfAborted();
    if (!cached) {
        await options.validateCandidate(plan, artifacts, execution, {
            verifier,
            signal,
            validateResources: verifier.validateResources,
        });
    }
    await assertPreparationUnchanged(options, state.revision, snapshot, execution.fingerprint);
    signal.throwIfAborted();
    const evidence = {
        instanceId: options.instanceId,
        siteId: options.siteId,
        actorId,
        expectedRevision: state.revision,
        systemRevision: snapshot.systemRevision,
        collectionRevision: snapshot.collectionRevision,
        executionFingerprint: initializationDigest({
            fingerprint: execution.fingerprint,
            siteBlocsRevision: snapshot.siteBlocsRevision,
        }),
        plan,
    };
    const review: InitializationReview = { ...evidence, digest: initializationDigest(evidence) };
    if (canonicalizeIJson(review).length > 1024 * 1024) {
        throw initializationError("Initialization review exceeds its wire limit");
    }
    reuse.remember(key, plan);
    return { review, artifacts };
}
