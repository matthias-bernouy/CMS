import { assertIJsonValue } from "@bernouy/cms-integration-packages";
import type { VerificationValue } from "@bernouy/cms-integration-verification/sdk/v1";

const MAX_FIXTURE_STATE_BYTES = 1_000_000;

export function snapshotFixtureState(value: unknown): VerificationValue {
    assertIJsonValue(value);
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > MAX_FIXTURE_STATE_BYTES) {
        throw new Error(`Upgrade fixture state exceeds ${MAX_FIXTURE_STATE_BYTES} bytes`);
    }
    return JSON.parse(serialized) as VerificationValue;
}
