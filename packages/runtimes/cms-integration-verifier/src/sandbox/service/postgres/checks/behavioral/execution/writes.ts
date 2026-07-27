import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../../evidence";
import { BEHAVIORAL_RLS_IDENTITIES } from "../constants";
import { executeAsSupabaseActor } from "../session";
import type { BehavioralRlsObservation, BehavioralRlsProbe } from "../types";
import { deleteFixture, insertFixture, updateSubject } from "./statements";

export async function inspectBehavioralRlsWrites(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    signal: AbortSignal,
) {
    const observations: BehavioralRlsObservation[] = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const probe of probes) {
        for (const actor of ["first", "second"] as const) {
            const own = actor === "first" ? probe.first : probe.second;
            const foreign = actor === "first" ? probe.second : probe.first;
            const ownSubject = BEHAVIORAL_RLS_IDENTITIES[actor];
            const foreignSubject =
                actor === "first" ? BEHAVIORAL_RLS_IDENTITIES.second : BEHAVIORAL_RLS_IDENTITIES.first;
            const crossInsert = actor === "first" ? probe.firstCrossInsert : probe.secondCrossInsert;
            await inspectWrite(
                database,
                probe,
                actor,
                "claim-foreign-row",
                "postgres-rls-cross-tenant-update",
                () => updateSubject(database, probe, foreign.key, ownSubject),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                probe,
                actor,
                "reassign-own-row",
                "postgres-rls-owner-reassignment",
                () => updateSubject(database, probe, own.key, foreignSubject),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                probe,
                actor,
                "delete-foreign-row",
                "postgres-rls-cross-tenant-delete",
                () => deleteFixture(database, probe, foreign.key),
                observations,
                findings,
                signal,
            );
            await inspectWrite(
                database,
                probe,
                actor,
                "insert-for-foreign-subject",
                "postgres-rls-cross-tenant-insert",
                () => insertFixture(database, probe, crossInsert, foreignSubject, true),
                observations,
                findings,
                signal,
            );
        }
    }
    return { observations, findings };
}

async function inspectWrite(
    database: SQL,
    probe: BehavioralRlsProbe,
    actor: "first" | "second",
    operation: string,
    findingCode: string,
    execute: () => Promise<unknown[]>,
    observations: BehavioralRlsObservation[],
    findings: PlatformVerificationFindingV1[],
    signal: AbortSignal,
): Promise<void> {
    const result = await executeAsSupabaseActor(database, actor, signal, execute);
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
    } else if (result.status === "success" && rowCount > 0) {
        findings.push(finding(findingCode, `${probe.probeId}.${actor}.${operation}`));
    }
}
