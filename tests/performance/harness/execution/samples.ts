import { witnessed } from "../../capabilities/evidence";
import { measurements } from "../docker/collect";
import type { MeasuredStack } from "../docker/collect";
import type { Measurement, Obligation, ScenarioDefinition, ScenarioResult } from "../../capabilities/types";
import type { Observation } from "../clients/types";
import { measuredLoad } from "../measurements/load";
import { ClientFailure } from "../clients/failure";

export type PreparedSample = Readonly<{
    send: () => Promise<Observation>;
    verify?: () => Promise<void>;
    close?: () => Promise<void>;
}>;

/** Preparation and postconditions remain outside client timing and cannot receive coverage credit. */
export async function sampleScenario(
    stack: MeasuredStack,
    definition: ScenarioDefinition,
    obligation: Obligation,
    prepare: () => Promise<PreparedSample>,
    collect = measurements,
): Promise<ScenarioResult> {
    const prepared: PreparedSample[] = [];
    const captured: Measurement[] = [];
    let status: ScenarioResult["status"] = "passed";
    let failure: string | undefined;
    let stage = "preparation";
    let load: ScenarioResult["load"];
    try {
        if (obligation.variant === "warm") {
            const warmups: Observation[] = [];
            for (let index = 0; index < 3; index++) {
                const sample = await prepare();
                prepared.push(sample);
                const observation = await sample.send();
                warmups.push(observation);
                if (observation.validated) {
                    await sample.verify?.();
                }
            }
            captured.push(...(await collect(stack, definition.id, obligation, warmups, "preparation")));
            if (warmups.some((sample) => !sample.validated)) {
                throw new Error("Warm-up failed");
            }
        }
        const active: PreparedSample[] = [];
        for (let index = 0; index < definition.samples; index++) {
            const sample = await prepare();
            active.push(sample);
            prepared.push(sample);
        }
        const observations: Observation[] = [];
        const started = performance.now();
        stage = "measurement";
        if (obligation.variant === "concurrent") {
            observations.push(...(await Promise.all(active.map((sample) => sample.send()))));
        } else {
            for (const sample of active) {
                const observation = await sample.send();
                observations.push(observation);
                if (obligation.variant === "cold") {
                    stage = "collection";
                    captured.push(...(await collect(stack, definition.id, obligation, [observation])));
                    stage = "measurement";
                }
            }
        }
        if (definition.load) {
            load = measuredLoad(definition.load.concurrency, performance.now() - started, observations);
        }
        stage = "collection";
        if (obligation.variant !== "cold") {
            captured.push(...(await collect(stack, definition.id, obligation, observations)));
        }
        stage = "verification";
        for (const [index, sample] of active.entries()) {
            if (observations[index]?.validated) {
                try {
                    await sample.verify?.();
                } catch {
                    const traceId = observations[index]!.traceId;
                    for (let row = 0; row < captured.length; row++) {
                        if (captured[row]!.traceId === traceId) {
                            captured[row] = {
                                ...captured[row]!,
                                validated: false,
                                error: "business-state-postcondition-failed",
                            };
                        }
                    }
                    status = "failed";
                    failure = "business-state-postcondition-failed";
                }
            }
        }
        if (!captured.filter((sample) => sample.phase === "measurement").every(witnessed)) {
            status = "failed";
            failure ??=
                [...new Set(observations.flatMap((sample) => (sample.failure ? [sample.failure] : [])))].join(", ") ||
                "Exact invocation evidence is incomplete";
        }
    } catch {
        status = stage === "verification" ? "failed" : "blocked";
        failure = stage === "verification" ? "business-state-postcondition-failed" : `Fixture ${stage} failed`;
    } finally {
        for (const sample of prepared.reverse()) {
            try {
                await sample.close?.();
            } catch (error) {
                status = "blocked";
                failure =
                    error instanceof ClientFailure ? `Fixture cleanup failed: ${error.code}` : "Fixture cleanup failed";
            }
        }
    }
    return {
        scenario: definition.id,
        status,
        ...(failure ? { failure } : {}),
        measurements: captured,
        ...(load ? { load } : {}),
    };
}
