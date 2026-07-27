import { SQL } from "bun";
import { BEHAVIORAL_RLS_IDENTITIES } from "../constants";
import type { BehavioralRlsFixture, BehavioralRlsProbe } from "../types";

export async function seedBehavioralRlsFixtures(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    signal: AbortSignal,
): Promise<void> {
    for (const probe of probes) {
        signal.throwIfAborted();
        await insertFixture(database, probe, probe.first, BEHAVIORAL_RLS_IDENTITIES.first);
        await insertFixture(database, probe, probe.second, BEHAVIORAL_RLS_IDENTITIES.second);
    }
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
