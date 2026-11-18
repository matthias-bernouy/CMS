import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { docker } from "../../integration/instance/docker";
import { performanceCapabilityInventory, scopedInventory } from "../capabilities/inventory";
import { sourceProvenance, verifyImage } from "../harness/measurements/provenance";
import { controlledPrograms } from "../harness/services/controlled";
import { assessmentScenarios } from "../scenarios/plan";
import { assertPerformancePlan, selectScenarios } from "./selection";
import { captureSourceSnapshot } from "../reporting/archive/source";

export type AssessmentScope = Readonly<{ contractId: string; capabilityId: string }>;

/** Resolve immutable execution inputs before acquiring stack or instrumentation resources. */
export async function prepareAssessment(
    images: { edge: string; provider: string },
    select = assessmentScenarios,
    scope?: AssessmentScope,
    scenarioIds: readonly string[] = [],
) {
    const source = await sourceProvenance();
    const identities = await Promise.all(
        (["edge", "provider"] as const).map(async (component) =>
            verifyImage(
                JSON.parse((await docker(["image", "inspect", images[component]])).stdout),
                component,
                images[component],
                source.revision,
            ),
        ),
    );
    const fullInventory = await performanceCapabilityInventory();
    const inventory = scope ? scopedInventory(fullInventory, scope) : fullInventory;
    const hash = createHash("sha256");
    const root = resolve(import.meta.dir, "../../..");
    const paths = [
        ...new Bun.Glob("tests/integration/instance/**/*.ts").scanSync({ cwd: root }),
        ...new Bun.Glob("tests/performance/scenarios/**/*.ts").scanSync({ cwd: root }),
        ...new Bun.Glob("tests/performance/harness/**/*.ts").scanSync({ cwd: root }),
        ...new Bun.Glob("tests/performance/fixtures/**/*").scanSync({ cwd: root, onlyFiles: true }),
        ...new Bun.Glob("tests/performance/assessment/**/*.ts").scanSync({ cwd: root }),
    ].toSorted();
    for (const path of paths) {
        hash.update(path).update(new Uint8Array(await Bun.file(path).arrayBuffer()));
    }
    const available = select(inventory, hash.digest("hex"));
    if (scenarioIds.length) {
        assertPerformancePlan(
            inventory,
            available.map((row) => row.definition),
        );
    }
    const scenarios = selectScenarios(available, scenarioIds);
    const selection = scenarioIds.length
        ? {
              kind: "selected-scenarios" as const,
              scenarioIds: scenarios.map((row) => row.definition.id),
              plannedScenarios: available.length,
          }
        : undefined;
    const programs = await controlledPrograms(
        inventory,
        scenarios.map((scenario) => scenario.definition),
    );
    // Execute by immutable image IDs, so changing a tag cannot switch the candidate after inspection.
    const executionImages = { edge: identities[0]!.id, provider: identities[1]!.id };
    const snapshot = await captureSourceSnapshot(root, undefined, source);
    const sourceArchive = { archiveSha256: snapshot.archiveSha256, manifestSha256: snapshot.manifestSha256 };
    return {
        source,
        sourceArchive,
        identities,
        fullInventory,
        inventory,
        scenarios,
        selection,
        programs,
        executionImages,
    };
}
