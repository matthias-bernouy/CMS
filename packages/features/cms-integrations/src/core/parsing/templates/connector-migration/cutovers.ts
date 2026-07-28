import { canonicalJsonBytes, assertIJsonValue, InvalidIJsonValueError } from "@bernouy/cms-integration-packages";
import {
    MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES,
    type DeclarativeConnectorMigrationPlan,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import type { IntegrationAnswerValue } from "../../../../interfaces/Integration";
import {
    assertRequiredMigrationKeys,
    invalidMigrationValue,
    migrationArray,
    migrationRecord,
    parseMigrationDuration,
    parseMigrationId,
} from "./values";

export function parseCmsMediatedCutover(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorMigrationPlan["cmsMediated"]> {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["strategy"], name, ["drainSeconds", "smoke"]);
    if (input.strategy !== "binding-switch") {
        invalidMigrationValue(`${name}.strategy`, 'must be "binding-switch"');
    }
    return {
        strategy: "binding-switch",
        ...(input.smoke === undefined ? {} : { smoke: parseHttpSmoke(input.smoke, `${name}.smoke`) }),
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: parseMigrationDuration(input.drainSeconds, `${name}.drainSeconds`) }),
    };
}

function parseHttpSmoke(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorMigrationPlan["cmsMediated"]>["smoke"] {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["endpointId", "expectedStatus"], name, ["expectedBody"]);
    const endpointId = parseMigrationId(input.endpointId, `${name}.endpointId`);
    if (
        !Number.isSafeInteger(input.expectedStatus) ||
        (input.expectedStatus as number) < 100 ||
        (input.expectedStatus as number) > 599
    ) {
        invalidMigrationValue(`${name}.expectedStatus`, "must be an HTTP status between 100 and 599");
    }
    if (input.expectedBody !== undefined) {
        assertBoundedSmokeBody(input.expectedBody, `${name}.expectedBody`);
    }
    return {
        endpointId,
        expectedStatus: input.expectedStatus as number,
        ...(input.expectedBody === undefined
            ? {}
            : { expectedBody: structuredClone(input.expectedBody) as IntegrationAnswerValue }),
    };
}

function assertBoundedSmokeBody(value: unknown, name: string): void {
    try {
        assertIJsonValue(value);
    } catch (error) {
        if (error instanceof InvalidIJsonValueError) {
            invalidMigrationValue(name, "must be a finite JSON value conforming to I-JSON");
        }
        throw error;
    }
    if (canonicalJsonBytes(value).byteLength > MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES) {
        invalidMigrationValue(name, `must not exceed ${MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES} canonical bytes`);
    }
}

export function parseProviderDirectCutover(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorMigrationPlan["providerDirect"]> {
    const input = migrationRecord(value, name);
    assertRequiredMigrationKeys(input, ["strategy", "callbackIds"], name, ["drainSeconds"]);
    if (input.strategy !== "expand-in-code" && input.strategy !== "journalled-provider-switch") {
        invalidMigrationValue(`${name}.strategy`, 'must be "expand-in-code" or "journalled-provider-switch"');
    }
    const callbackIds = migrationArray(input.callbackIds, `${name}.callbackIds`).map((entry, index) =>
        parseMigrationId(entry, `${name}.callbackIds.${index}`),
    );
    if (!callbackIds.length || new Set(callbackIds).size !== callbackIds.length) {
        invalidMigrationValue(`${name}.callbackIds`, "must contain unique callback ids");
    }
    return {
        strategy: input.strategy,
        callbackIds,
        ...(input.drainSeconds === undefined
            ? {}
            : { drainSeconds: parseMigrationDuration(input.drainSeconds, `${name}.drainSeconds`) }),
    };
}
