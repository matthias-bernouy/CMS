import { witnessed } from "../../capabilities/evidence";
import { measurements } from "../docker/collect";
import type { MeasuredStack } from "../docker/collect";
import type { Measurement, Obligation, ScenarioDefinition, ScenarioResult } from "../../capabilities/types";
import type { Observation } from "../clients/types";
import { measuredLoad } from "../measurements/load";
import { ClientFailure } from "../clients/failure";
import { clearPreparationTraces } from "../docker/traces";

export type PreparedSample = Readonly<{
    beforeMeasure?: () => Promise<void>;
    send: () => Promise<Observation>;
    verify?: () => Promise<void>;
    close?: () => Promise<void>;
}>;

/** Preparation and postconditions remain outside client timing and cannot receive coverage credit. */
export async function sampleScenario(
    stack: MeasuredStack,
    definition: ScenarioDefinition,
    obligation: Obligation,
    prepare: (sampleIndex: number) => Promise<PreparedSample>,
    collect = measurements,
    resetTraces = clearPreparationTraces,
): Promise<ScenarioResult> {
    const prepared = new Set<PreparedSample>();
    const captured: Measurement[] = [];
    let status: ScenarioResult["status"] = "passed";
    let failure: string | undefined;
    let stage = "preparation";
    let load: ScenarioResult["load"];
    const close = async (sample: PreparedSample) => {
        prepared.delete(sample);
        try {
            await sample.close?.();
        } catch (error) {
            status = "blocked";
            failure =
                error instanceof ClientFailure ? `Fixture cleanup failed: ${error.code}` : "Fixture cleanup failed";
        }
    };
    const verify = async (sample: PreparedSample, observation: Observation) => {
        if (!observation.validated) {
            return false;
        }
        stage = "verification";
        try {
            await sample.verify?.();
            return true;
        } catch (error) {
            for (let index = 0; index < captured.length; index++) {
                if (captured[index]!.traceId === observation.traceId) {
                    captured[index] = {
                        ...captured[index]!,
                        validated: false,
                        error: "business-state-postcondition-failed",
                    };
                }
            }
            if (status !== "blocked") {
                status = "failed";
                failure = error instanceof ClientFailure ? error.code : "business-state-postcondition-failed";
            }
            return false;
        }
    };
    const observations: Observation[] = [];
    const sequential = async (index: number, phase: "preparation" | "measurement") => {
        stage = "preparation";
        const sample = await prepare(index);
        prepared.add(sample);
        try {
            await sample.beforeMeasure?.();
            await resetTraces(stack);
            stage = "measurement";
            const observation = await sample.send();
            if (phase === "measurement") {
                observations.push(observation);
            }
            stage = "collection";
            captured.push(...(await collect(stack, definition.id, obligation, [observation], phase)));
            return await verify(sample, observation);
        } finally {
            await close(sample);
        }
    };
    try {
        if (obligation.variant === "warm") {
            for (let index = 0; index < 3; index++) {
                if (!(await sequential(index, "preparation"))) {
                    stage = "preparation";
                    throw new ClientFailure("warm-up-failed");
                }
            }
        }
        if (obligation.variant === "concurrent") {
            const active: PreparedSample[] = [];
            for (let index = 0; index < definition.samples; index++) {
                stage = "preparation";
                const sample = await prepare(index);
                active.push(sample);
                prepared.add(sample);
            }
            const readiness = await Promise.allSettled(
                active.map((sample) => Promise.resolve().then(() => sample.beforeMeasure?.())),
            );
            for (const result of readiness) {
                if (result.status === "rejected") {
                    throw result.reason;
                }
            }
            await resetTraces(stack);
            stage = "measurement";
            const started = performance.now();
            const settled = await Promise.allSettled(
                active.map((sample) => Promise.resolve().then(() => sample.send())),
            );
            const elapsed = performance.now() - started;
            for (const result of settled) {
                if (result.status === "fulfilled") {
                    observations.push(result.value);
                } else {
                    status = "blocked";
                    failure = "Fixture measurement failed";
                }
            }
            if (definition.load && settled.every((result) => result.status === "fulfilled")) {
                load = measuredLoad(definition.load.concurrency, elapsed, observations);
            }
            stage = "collection";
            if (observations.length) {
                captured.push(...(await collect(stack, definition.id, obligation, observations)));
            }
            for (const [index, result] of settled.entries()) {
                if (result.status === "fulfilled") {
                    await verify(active[index]!, result.value);
                }
            }
        } else {
            for (let index = 0; index < definition.samples; index++) {
                await sequential(index + (obligation.variant === "warm" ? 3 : 0), "measurement");
            }
        }
        if (status !== "blocked" && !captured.filter((sample) => sample.phase === "measurement").every(witnessed)) {
            status = "failed";
            failure ??=
                [...new Set(observations.flatMap((sample) => (sample.failure ? [sample.failure] : [])))].join(", ") ||
                "Exact invocation evidence is incomplete";
        }
    } catch (error) {
        status = stage === "verification" ? "failed" : "blocked";
        failure =
            stage === "verification"
                ? "business-state-postcondition-failed"
                : error instanceof ClientFailure
                  ? `Fixture ${stage} failed: ${error.code}`
                  : `Fixture ${stage} failed`;
    } finally {
        for (const sample of [...prepared].reverse()) {
            await close(sample);
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
