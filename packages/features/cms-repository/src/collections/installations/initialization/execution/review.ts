import { planCollectionInitialization, initializationDigest } from "../planning/plan";
import { verifyStoredCollectionArtifact } from "../../../core/admission/collectionArtifact";
import type { AdmittedCollectionRelease } from "../../../interfaces/CollectionAdmission";
import type { InitializationReview, InitializationServiceOptions } from "./interfaces";
import {
    assertEmptyInitialization,
    assertInitializationRoutesAvailable,
    initializationError,
    readInitialization,
} from "./state";
import { resolveInitializationGraph } from "./catalogue";
import { DEFAULT_INITIALIZATION_LIMITS } from "../limits";

export async function prepareInitialization(
    options: InitializationServiceOptions,
    actorId: string,
    root: unknown,
    locale?: string,
) {
    const state = await readInitialization(options);
    if (state.status !== "pending") {
        throw initializationError("Initialization was already started", 409);
    }
    const snapshot = await assertEmptyInitialization(options);
    const execution = await options.execution();
    const graph = root === null ? { root: null, metadata: [] } : await resolveInitializationGraph(options.source, root);
    const plan = await planCollectionInitialization(graph.root, graph.metadata, {
        selected: execution.selected,
        denied: execution.denied,
        locale,
    });
    await assertInitializationRoutesAvailable(
        options,
        plan.pages.map(({ path }) => path),
    );
    const artifacts: AdmittedCollectionRelease[] = [];
    let remainingBytes = DEFAULT_INITIALIZATION_LIMITS.maxDeclaredAssetBytes;
    for (const pin of plan.collections) {
        const bundle = await options.source.get(pin, { maxAssetBytes: remainingBytes });
        const artifact = await verifyStoredCollectionArtifact(bundle.release, bundle.assets, pin.digest);
        remainingBytes -= artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0);
        if (remainingBytes < 0) {
            throw initializationError("Initialization asset budget exceeded");
        }
        artifacts.push(artifact);
    }
    await options.validateCandidate(plan, artifacts, execution);
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
    return { review, artifacts };
}
