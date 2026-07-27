import { SQL } from "bun";
import type { PlatformVerificationFindingV1 } from "@bernouy/cms-integration-verification";
import { finding } from "../../../evidence";
import { executeAsSupabaseActor } from "../session";
import type { BehavioralRlsActor, BehavioralRlsObservation, BehavioralRlsProbe } from "../types";
import { identifier, target } from "./statements";

export async function inspectBehavioralRlsReads(
    database: SQL,
    probes: readonly BehavioralRlsProbe[],
    signal: AbortSignal,
) {
    const observations: BehavioralRlsObservation[] = [];
    const findings: PlatformVerificationFindingV1[] = [];
    for (const probe of probes) {
        for (const actor of ["anon", "first", "second"] as const) {
            const result = await executeAsSupabaseActor(database, actor, signal, async () => {
                return (await database.unsafe(
                    `select ${identifier(probe.keyColumn)}::text as "visibleKey" from ${target(probe)}
                     where ${identifier(probe.keyColumn)}::text in ($1::text, $2::text)
                     order by ${identifier(probe.keyColumn)}::text collate "C"`,
                    [String(probe.first.key), String(probe.second.key)],
                )) as Array<{ visibleKey: string }>;
            });
            const rows = result.status === "success" ? result.value : [];
            observations.push(readObservation(probe, actor, result.status, rows.length));
            findings.push(
                ...readFindings(
                    probe,
                    actor,
                    result.status,
                    rows.map(({ visibleKey }) => visibleKey),
                ),
            );
        }
    }
    return { observations, findings };
}

function readFindings(
    probe: BehavioralRlsProbe,
    actor: BehavioralRlsActor,
    status: "success" | "denied" | "error",
    visibleKeys: readonly string[],
): PlatformVerificationFindingV1[] {
    const path = `${probe.probeId}.${actor}.select`;
    if (status === "error") {
        return [finding("postgres-rls-behavior-execution-error", path)];
    }
    if (actor === "anon") {
        return visibleKeys.length === 0 ? [] : [finding("postgres-rls-anon-read", path)];
    }
    if (status === "denied") {
        return [finding("postgres-rls-authenticated-read-denied", path)];
    }
    const own = String(actor === "first" ? probe.first.key : probe.second.key);
    const foreign = String(actor === "first" ? probe.second.key : probe.first.key);
    const findings: PlatformVerificationFindingV1[] = [];
    if (!visibleKeys.includes(own)) {
        findings.push(finding("postgres-rls-owner-row-hidden", path));
    }
    if (visibleKeys.includes(foreign)) {
        findings.push(finding("postgres-rls-cross-tenant-read", path));
    }
    return findings;
}

function readObservation(
    probe: BehavioralRlsProbe,
    actor: BehavioralRlsActor,
    status: "success" | "denied" | "error",
    rowCount: number,
): BehavioralRlsObservation {
    return {
        probeId: probe.probeId,
        actor,
        operation: "select",
        outcome: status === "success" ? (rowCount === 0 ? "empty" : "rows") : status,
        rowCount,
    };
}
