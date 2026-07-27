import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../../evidence";
import { executeAsSupabaseActor } from "../session";
import type { BehavioralRlsActor, BehavioralRlsActors, BehavioralRlsObservation, BehavioralRlsProbe } from "../types";
import { deleteFixture, insertFixture, updateSubject } from "./statements";

export async function inspectBehavioralRlsWrites(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    actors: BehavioralRlsActors,
    signal: AbortSignal,
) {
    const observations: BehavioralRlsObservation[] = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const probe of probes) {
        for (const actor of ["first", "second"] as const) {
            const own = actor === "first" ? probe.first : probe.second;
            const foreign = actor === "first" ? probe.second : probe.first;
            const ownSubject = actors[actor].subject;
            const foreignSubject = actors[actor === "first" ? "second" : "first"].subject;
            const crossInsert = actor === "first" ? probe.firstCrossInsert : probe.secondCrossInsert;
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "update-own-row",
                "allow",
                "postgres-rls-owner-update-denied",
                () => updateSubject(database, probe, own.key, ownSubject),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "delete-own-row",
                "allow",
                "postgres-rls-owner-delete-denied",
                () => deleteFixture(database, probe, own.key),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "claim-foreign-row",
                "deny",
                "postgres-rls-cross-tenant-update",
                () => updateSubject(database, probe, foreign.key, ownSubject),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "reassign-own-row",
                "deny",
                "postgres-rls-owner-reassignment",
                () => updateSubject(database, probe, own.key, foreignSubject),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "delete-foreign-row",
                "deny",
                "postgres-rls-cross-tenant-delete",
                () => deleteFixture(database, probe, foreign.key),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                actors,
                probe,
                actor,
                "insert-for-foreign-subject",
                "deny",
                "postgres-rls-cross-tenant-insert",
                () => insertFixture(database, probe, crossInsert, foreignSubject, true),
                observations,
                findings,
                signal,
            );
        }
        await inspectAnonymousWrites(database, actors, probe, observations, findings, signal);
    }
    return { observations, findings };
}

async function inspectWrite(
    database: SQL,
    actors: BehavioralRlsActors,
    probe: BehavioralRlsProbe,
    actor: BehavioralRlsActor,
    operation: string,
    expectation: "allow" | "deny",
    findingCode: string,
    execute: () => Promise<unknown[]>,
    observations: BehavioralRlsObservation[],
    findings: PlatformVerificationFindingV1[],
    signal: AbortSignal,
): Promise<void> {
    const result = await executeAsSupabaseActor(database, actors, actor, signal, execute);
    const rowCount = result.status === "success" ? result.value.length : 0;
    observations.push({
        probeId: probe.probeId,
        actor,
        operation,
        outcome: result.status === "success" ? (rowCount === 0 ? "empty" : "rows") : result.status,
        rowCount,
    });
    if (result.status === "error") {
        findings.push(finding("postgres-rls-behavior-execution-error", `${probe.probeId}.${actor}.${operation}`));
    } else if (expectation === "allow" && (result.status !== "success" || rowCount !== 1)) {
        findings.push(finding(findingCode, `${probe.probeId}.${actor}.${operation}`));
    } else if (expectation === "deny" && result.status === "success" && rowCount > 0) {
        findings.push(finding(findingCode, `${probe.probeId}.${actor}.${operation}`));
    }
}

async function inspectAnonymousWrites(
    database: SQL,
    actors: BehavioralRlsActors,
    probe: BehavioralRlsProbe,
    observations: BehavioralRlsObservation[],
    findings: PlatformVerificationFindingV1[],
    signal: AbortSignal,
): Promise<void> {
    const operations = [
        [
            "insert-row",
            "postgres-rls-anon-insert",
            () => insertFixture(database, probe, probe.firstCrossInsert, actors.first.subject, true),
        ],
        [
            "update-row",
            "postgres-rls-anon-update",
            () => updateSubject(database, probe, probe.first.key, actors.first.subject),
        ],
        ["delete-row", "postgres-rls-anon-delete", () => deleteFixture(database, probe, probe.first.key)],
    ] as const;
    for (const [operation, code, execute] of operations) {
        await inspectWrite(
            database,
            actors,
            probe,
            "anon",
            operation,
            "deny",
            code,
            execute,
            observations,
            findings,
            signal,
        );
    }
}
