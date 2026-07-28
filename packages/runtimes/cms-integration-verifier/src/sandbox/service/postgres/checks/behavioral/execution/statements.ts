import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../../evidence";
import { executeAsSupabaseActor } from "../session";
import type { BehavioralRlsActors, BehavioralRlsFixture, BehavioralRlsObservation, BehavioralRlsProbe } from "../types";

export async function seedBehavioralRlsFixtures(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    actors: BehavioralRlsActors,
    signal: AbortSignal,
): Promise<
    Readonly<{ observations: readonly BehavioralRlsObservation[]; findings: readonly PlatformVerificationFindingV1[] }>
> {
    const observations: BehavioralRlsObservation[] = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const probe of probes) {
        for (const actor of ["first", "second"] as const) {
            const fixture = actor === "first" ? probe.first : probe.second;
            const result = await executeAsSupabaseActor(
                database,
                actors,
                actor,
                signal,
                async () => await insertFixture(database, probe, fixture, actors[actor].subject, true),
                { preserveSuccess: true },
            );
            const rowCount = result.status === "success" ? result.value.length : 0;
            observations.push({
                probeId: probe.probeId,
                actor,
                operation: "insert-own-row",
                outcome: result.status === "success" ? (rowCount === 0 ? "empty" : "rows") : result.status,
                rowCount,
            });
            if (result.status === "error") {
                findings.push(
                    finding("postgres-rls-behavior-execution-error", `${probe.probeId}.${actor}.insert-own-row`),
                );
            } else if (result.status !== "success" || rowCount !== 1) {
                findings.push(finding("postgres-rls-owner-insert-denied", `${probe.probeId}.${actor}.insert-own-row`));
            }
        }
    }
    return { observations, findings };
}

export async function insertFixture(
    database: SQL,
    probe: BehavioralRlsProbe,
    fixture: BehavioralRlsFixture,
    subject: string,
    returning = false,
): Promise<unknown[]> {
    const values = Object.entries(fixture.values).toSorted(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
    );
    const columns = [probe.keyColumn, probe.subjectColumn, ...values.map(([column]) => column)];
    const parameters = [fixture.key, subject, ...values.map(([, value]) => value)];
    return (await database.unsafe(
        `insert into ${target(probe)} (${columns.map(identifier).join(", ")})
         values (${parameters.map((_, index) => `$${index + 1}`).join(", ")})${
             returning ? ` returning ${identifier(probe.keyColumn)}` : ""
}`,
        parameters,
    )) as unknown[];
}

export async function updateSubject(database: SQL, probe: BehavioralRlsProbe, key: unknown, subject: string) {
    return (await database.unsafe(
        `update ${target(probe)} set ${identifier(probe.subjectColumn)} = $1
         where ${identifier(probe.keyColumn)}::text = $2::text returning ${identifier(probe.keyColumn)}`,
        [subject, String(key)],
    )) as unknown[];
}

export async function deleteFixture(database: SQL, probe: BehavioralRlsProbe, key: unknown) {
    return (await database.unsafe(
        `delete from ${target(probe)} where ${identifier(probe.keyColumn)}::text = $1::text
         returning ${identifier(probe.keyColumn)}`,
        [String(key)],
    )) as unknown[];
}

export function target(probe: BehavioralRlsProbe): string {
    return `${identifier(probe.namespace)}.${identifier(probe.relation)}`;
}

export function identifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}
