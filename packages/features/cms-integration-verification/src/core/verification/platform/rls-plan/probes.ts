import type {
    BehavioralRlsFixtureV1,
    BehavioralRlsProbeV1,
    BehavioralRlsScalarV1,
} from "../../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../../validation/errors";
import { assertUnique, boundedArray, invalid, strictRecord } from "../../../validation/structure";
import { requiredText, stableIdentifier } from "../../../validation/values";
import { compareText } from "../../shared";

export const BEHAVIORAL_RLS_PLAN_LIMITS = Object.freeze({
    probes: 32,
    fixtureFields: 48,
    scalarStringBytes: 4_096,
    canonicalBytes: 512 * 1_024,
});

export function parseBehavioralRlsProbes(value: unknown, field: string): readonly BehavioralRlsProbeV1[] {
    const probes = boundedArray(value, field, parseProbe, { maximum: BEHAVIORAL_RLS_PLAN_LIMITS.probes }).toSorted(
        (left, right) => compareText(left.probeId, right.probeId),
    );
    assertUnique(
        probes.map((probe) => probe.probeId),
        `${field}.probeId`,
    );
    assertUnique(
        probes.map((probe) => `${probe.namespace}\0${probe.relation}`),
        `${field} relation identity`,
    );
    return probes;
}

function parseProbe(value: unknown, field: string): BehavioralRlsProbeV1 {
    const input = strictRecord(value, field, [
        "probeId",
        "namespace",
        "relation",
        "keyColumn",
        "subjectColumn",
        "first",
        "second",
        "firstCrossInsert",
        "secondCrossInsert",
    ]);
    const keyColumn = postgresIdentifier(input.keyColumn, `${field}.keyColumn`);
    const subjectColumn = postgresIdentifier(input.subjectColumn, `${field}.subjectColumn`);
    if (keyColumn === subjectColumn) {
        throw invalid(field, "must use distinct key and subject columns");
    }
    const fixtureContext = { keyColumn, subjectColumn };
    const probe = {
        probeId: stableIdentifier(input.probeId, `${field}.probeId`),
        namespace: postgresIdentifier(input.namespace, `${field}.namespace`),
        relation: postgresIdentifier(input.relation, `${field}.relation`),
        keyColumn,
        subjectColumn,
        first: parseFixture(input.first, `${field}.first`, fixtureContext),
        second: parseFixture(input.second, `${field}.second`, fixtureContext),
        firstCrossInsert: parseFixture(input.firstCrossInsert, `${field}.firstCrossInsert`, fixtureContext),
        secondCrossInsert: parseFixture(input.secondCrossInsert, `${field}.secondCrossInsert`, fixtureContext),
    };
    assertUnique(
        [probe.first, probe.second, probe.firstCrossInsert, probe.secondCrossInsert].map((fixture) =>
            scalarIdentity(fixture.key),
        ),
        `${field} fixture keys`,
    );
    return probe;
}

function parseFixture(
    value: unknown,
    field: string,
    context: Readonly<{ keyColumn: string; subjectColumn: string }>,
): BehavioralRlsFixtureV1 {
    const input = strictRecord(value, field, ["key", "values"]);
    const key = scalar(input.key, `${field}.key`);
    if (key === null) {
        throw invalid(`${field}.key`, "must not be null");
    }
    const rawValues = strictRecord(input.values, `${field}.values`, Object.keys((input.values ?? {}) as object));
    const entries = Object.entries(rawValues).toSorted(([left], [right]) => compareText(left, right));
    if (entries.length > BEHAVIORAL_RLS_PLAN_LIMITS.fixtureFields) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `${field}.values must not contain more than ${BEHAVIORAL_RLS_PLAN_LIMITS.fixtureFields} fields`,
            `${field}.values`,
        );
    }
    const values: Record<string, BehavioralRlsScalarV1> = {};
    for (const [column, rawValue] of entries) {
        const parsedColumn = postgresIdentifier(column, `${field}.values.${column}`);
        if (parsedColumn === context.keyColumn || parsedColumn === context.subjectColumn) {
            throw invalid(`${field}.values.${column}`, "must not replace a generated identity column");
        }
        values[parsedColumn] = scalar(rawValue, `${field}.values.${column}`);
    }
    return { key, values };
}

function postgresIdentifier(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 63);
    if (parsed.includes("\0")) {
        throw invalid(field, "must be a PostgreSQL identifier without NUL bytes");
    }
    return parsed;
}

function scalar(value: unknown, field: string): BehavioralRlsScalarV1 {
    if (value === null || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return value;
    }
    if (typeof value === "string") {
        return requiredText(value, field, BEHAVIORAL_RLS_PLAN_LIMITS.scalarStringBytes);
    }
    throw invalid(field, "must be a null, boolean, safe integer, or bounded string");
}

function scalarIdentity(value: BehavioralRlsScalarV1): string {
    return value === null ? "null" : `${typeof value}:${String(value)}`;
}
