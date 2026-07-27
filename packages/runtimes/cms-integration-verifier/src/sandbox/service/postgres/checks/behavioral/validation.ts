import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { BEHAVIORAL_RLS_LIMITS } from "./constants";
import type { BehavioralRlsFixture, BehavioralRlsProbe, BehavioralRlsScalar } from "./types";

export function assertBehavioralRlsProbes(probes: readonly BehavioralRlsProbe[]): void {
    if (probes.length === 0 || probes.length > BEHAVIORAL_RLS_LIMITS.probes) {
        throw new TypeError("Behavioral RLS proof requires a bounded non-empty probe set");
    }
    if (canonicalJsonBytes(probes).length > BEHAVIORAL_RLS_LIMITS.planBytes) {
        throw new TypeError("Behavioral RLS proof plan exceeds its byte limit");
    }
    const ids = new Set<string>();
    for (const probe of probes) {
        assertExactKeys(probe, [
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
        assertText(probe.probeId, "probe id");
        if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(probe.probeId)) {
            throw new TypeError("Behavioral RLS probe id is invalid");
        }
        if (ids.has(probe.probeId)) {
            throw new TypeError("Behavioral RLS probe ids must be unique");
        }
        ids.add(probe.probeId);
        for (const identifier of [probe.namespace, probe.relation, probe.keyColumn, probe.subjectColumn]) {
            assertIdentifier(identifier);
        }
        if (probe.keyColumn === probe.subjectColumn) {
            throw new TypeError("Behavioral RLS key and subject columns must be distinct");
        }
        const fixtures = [probe.first, probe.second, probe.firstCrossInsert, probe.secondCrossInsert];
        for (const fixture of fixtures) {
            assertFixture(fixture, probe);
        }
        const keys = fixtures.map(({ key }) => scalarIdentity(key));
        if (new Set(keys).size !== keys.length) {
            throw new TypeError("Behavioral RLS fixture keys must be unique");
        }
    }
}

function assertFixture(fixture: BehavioralRlsFixture, probe: BehavioralRlsProbe): void {
    assertExactKeys(fixture, ["key", "values"]);
    if (fixture.key === null) {
        throw new TypeError("Behavioral RLS fixture keys cannot be null");
    }
    assertScalar(fixture.key);
    if (!fixture.values || typeof fixture.values !== "object" || Array.isArray(fixture.values)) {
        throw new TypeError("Behavioral RLS fixture values must be a record");
    }
    const entries = Object.entries(fixture.values);
    if (entries.length > BEHAVIORAL_RLS_LIMITS.fixtureFields) {
        throw new TypeError("Behavioral RLS fixture has too many fields");
    }
    for (const [column, value] of entries) {
        assertIdentifier(column);
        if (column === probe.keyColumn || column === probe.subjectColumn) {
            throw new TypeError("Behavioral RLS fixture cannot replace generated identity fields");
        }
        assertScalar(value);
    }
}

function assertIdentifier(value: string): void {
    assertText(value, "PostgreSQL identifier");
    if (new TextEncoder().encode(value).length > 63 || value.includes("\0")) {
        throw new TypeError("Behavioral RLS PostgreSQL identifier is invalid");
    }
}

function assertScalar(value: BehavioralRlsScalar): void {
    if (value === null || typeof value === "boolean") {
        return;
    }
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) {
            throw new TypeError("Behavioral RLS numeric fixtures must be safe integers");
        }
        return;
    }
    if (typeof value === "string" && new TextEncoder().encode(value).length <= BEHAVIORAL_RLS_LIMITS.stringBytes) {
        return;
    }
    throw new TypeError("Behavioral RLS fixture contains an unsupported scalar");
}

function assertText(value: string, label: string): void {
    if (value.length === 0 || new TextEncoder().encode(value).length > BEHAVIORAL_RLS_LIMITS.stringBytes) {
        throw new TypeError(`Behavioral RLS ${label} is invalid`);
    }
}

function scalarIdentity(value: BehavioralRlsScalar): string {
    return String(value);
}

function assertExactKeys(value: object, expected: readonly string[]): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Behavioral RLS plan object is invalid");
    }
    const actual = Object.keys(value).toSorted();
    const sortedExpected = [...expected].toSorted();
    if (actual.length !== sortedExpected.length || actual.some((entry, index) => entry !== sortedExpected[index])) {
        throw new TypeError("Behavioral RLS plan contains unknown or missing fields");
    }
}
