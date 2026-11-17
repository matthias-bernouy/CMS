import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { budgetFor, loadPolicy } from "../../capabilities/policies";
import { sampleScenario } from "../../harness/execution/samples";
import { assertCondition } from "../queries/types";
import { initializationFixture } from "./fixture";
import { assertInitializationReview } from "./review";
import { expectedAfterRestarts } from "./state";
import { settleInitialization } from "./settlement";
import type { CapabilityInventory, Variant } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
import type { InitializationFixture } from "./fixture";
import type { InitializationReview } from "@bernouy/repository/collections/installations";
import type { measurements } from "../../harness/docker/collect";

const CASES: readonly Readonly<{ name: string; variants: readonly Variant[] }>[] = [
    { name: "empty", variants: ["nominal", "cold", "warm", "concurrent"] },
    { name: "one-page", variants: ["nominal", "cold", "warm", "concurrent"] },
    ...["25-pages", "100-pages", "includes", "assets"].map((name) => ({
        name,
        variants: ["large", "concurrent"] as const,
    })),
    { name: "history", variants: ["history", "warm"] },
    { name: "invalidation", variants: ["invalidation"] },
    { name: "mossa", variants: ["nominal", "cold", "warm", "concurrent"] },
    ...[0, 1, 21].map((count) => ({ name: `mossa-control-${count}`, variants: ["large"] as const })),
];

export function initializationScenarios(
    inventory: CapabilityInventory,
    fixtureDigest: string,
    coldSamples = 3,
    collect?: typeof measurements,
) {
    if (!Number.isSafeInteger(coldSamples) || coldSamples < 1 || coldSamples > 100) {
        throw new Error("Cold sample count must be between 1 and 100");
    }
    const target = inventory.targets.find(
        (entry) =>
            !entry.retained &&
            entry.release.contractId === "ulvia/cms.installations" &&
            entry.definition.id === "initialization.plan",
    );
    if (!target || target.definition.behavior.effect !== "query" || target.definition.bindings.length !== 2) {
        throw new Error("Initialization plan scenario inventory is stale");
    }
    let prepared: Promise<InitializationFixture> | undefined;
    return CASES.flatMap((recipe) =>
        target.definition.bindings.flatMap(({ id: binding }) =>
            recipe.variants.map((variant) => {
                const obligation = { target: target.key, binding, variant };
                const definition = {
                    id: `initialization.plan.${recipe.name}.${binding}.${variant}`,
                    version: 1,
                    fixture: fixtureDigest,
                    obligations: [obligation],
                    budget: budgetFor(target, variant),
                    samples:
                        variant === "cold"
                            ? coldSamples
                            : recipe.name.startsWith("mossa") && variant !== "concurrent"
                              ? 3
                              : 10,
                    ...loadPolicy(variant),
                };
                return {
                    definition,
                    async execute(environment: QueryEnvironment) {
                        try {
                            const state = await (prepared ??= initializationFixture(environment));
                            const dataset = await state.dataset(
                                recipe.name === "invalidation" ? "one-page" : recipe.name,
                            );
                            let previous: InitializationReview | undefined;
                            if (variant === "invalidation") {
                                previous = assertInitializationReview(
                                    await state.call("initialization.plan", { root: dataset.root }),
                                    state,
                                    dataset,
                                );
                                const settings = await state.call("site.get", {}, "ulvia/cms.content");
                                await state.call(
                                    "site.update",
                                    { expectedRevision: settings.revision, name: `Performance review ${binding}` },
                                    "ulvia/cms.content",
                                );
                            }
                            const before = await state.snapshot();
                            let coldCompleted = 0;
                            const baseline: Readonly<Record<string, unknown>> =
                                variant === "cold" ? expectedAfterRestarts(before, definition.samples) : before;
                            return sampleScenario(
                                environment.stack,
                                definition,
                                obligation,
                                async () => ({
                                    async send() {
                                        if (variant === "cold") {
                                            await environment.stack.restartProvider();
                                        }
                                        const result = await state.client(
                                            "ulvia/cms.installations",
                                            "initialization.plan",
                                            binding,
                                            { root: dataset.root },
                                            (output) => {
                                                const review = assertInitializationReview(output, state, dataset);
                                                if (previous) {
                                                    assertCondition(
                                                        review.systemRevision > previous.systemRevision &&
                                                            review.digest !== previous.digest,
                                                    );
                                                }
                                            },
                                        );
                                        if (recipe.name.startsWith("mossa")) {
                                            const settled = await settleInitialization(
                                                environment.stack.providerName,
                                                result.observation.traceId,
                                            );
                                            // A refusal or timeout must preserve the same durable state as a successful preview.
                                            const unchanged =
                                                canonicalizeIJson(await state.snapshot()) ===
                                                canonicalizeIJson(
                                                    variant === "cold"
                                                        ? expectedAfterRestarts(before, coldCompleted + 1)
                                                        : before,
                                                );
                                            if (variant === "cold") {
                                                coldCompleted++;
                                            }
                                            if (!settled || !unchanged) {
                                                return {
                                                    ...result.observation,
                                                    validated: false,
                                                    failure: !settled
                                                        ? "provider-settlement-timeout"
                                                        : "business-state-postcondition-failed",
                                                };
                                            }
                                        }
                                        return result.observation;
                                    },
                                    async verify() {
                                        const current: Readonly<Record<string, unknown>> = await state.snapshot();
                                        const changed = Object.keys(baseline).filter(
                                            (field) =>
                                                canonicalizeIJson(current[field]) !==
                                                canonicalizeIJson(baseline[field]),
                                        );
                                        if (changed.length) {
                                            console.log(
                                                `initialization state changed: ${definition.id}: ${changed.join(",")}`,
                                            );
                                        }
                                        assertCondition(changed.length === 0);
                                    },
                                }),
                                collect,
                            );
                        } catch (error) {
                            if (error instanceof Error) {
                                // Stack locations identify fixture defects without persisting remote messages or DTOs.
                                const locations = error.stack
                                    ?.split("\n")
                                    .filter((line) => line.trim().startsWith("at "))
                                    .slice(0, 5);
                                console.log(`Initialization fixture error locations: ${locations?.join("; ")}`);
                            }
                            return {
                                scenario: definition.id,
                                status: "blocked" as const,
                                measurements: [],
                                failure: "Initialization performance fixture preparation failed",
                            };
                        }
                    },
                };
            }),
        ),
    );
}

export function administrationScenarios(inventory: CapabilityInventory, fixtureDigest: string) {
    return initializationScenarios(inventory, fixtureDigest).filter(({ definition }) =>
        definition.id.startsWith("initialization.plan.mossa"),
    );
}
