import { assertCondition } from "../../../queries/types";

/** Retain fixed diagnostic codes only; no installation identity or response values enter errors. */
export function assertMetadataProviderObservation(
    entry: Record<string, unknown>,
    expected: Record<string, unknown>,
    controlled: boolean,
) {
    const kind = controlled ? "controlled" : "baseline";
    assertCondition(Number.isSafeInteger(entry.revision), `metadata-provider-${kind}-revision-integer`);
    assertCondition(
        Number(entry.revision) >= Number(expected.revision),
        `metadata-provider-${kind}-revision-monotonic`,
    );
    assertCondition(typeof entry.observedAt === "string", `metadata-provider-${kind}-observation-string`);
    assertCondition(
        Date.parse(String(entry.observedAt)) >= Date.parse(String(expected.observedAt)),
        `metadata-provider-${kind}-observation-monotonic`,
    );
    assertCondition(
        Date.parse(String(entry.observedAt)) <= Date.now() + 1000,
        `metadata-provider-${kind}-observation-not-future`,
    );
}
