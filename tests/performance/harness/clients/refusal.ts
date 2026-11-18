import { capabilityRequest, responseBytes } from "../transport/http";
import { ClientFailure } from "./failure";
import type { CapabilityInventory } from "../../capabilities/types";
import type { ScenarioSession } from "./session";

/** Negative probes deliberately bypass input validation and never produce a coverage Observation. */
export async function expectBodyRefusal(
    inventory: CapabilityInventory,
    session: Pick<ScenarioSession, "origin" | "cookie">,
    contractId: string,
    capabilityId: string,
    validInput: Readonly<Record<string, unknown>>,
    invalidInput: Readonly<Record<string, unknown>>,
    expectedStatus = 422,
) {
    const target = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capabilityId,
    );
    if (!target) {
        throw new ClientFailure("negative-probe-target-missing");
    }
    const request = capabilityRequest(session.origin, target, "http", validInput, { cookie: session.cookie });
    if (
        typeof request.init.body !== "string" ||
        request.init.headers.get("content-type") !== "application/json" ||
        !Number.isSafeInteger(expectedStatus) ||
        expectedStatus < 400 ||
        expectedStatus > 599
    ) {
        throw new ClientFailure("negative-probe-json-body-required");
    }
    const body = JSON.stringify(invalidInput);
    if (Buffer.byteLength(body) > 4 * 1024 * 1024) {
        throw new ClientFailure("negative-probe-body-limit");
    }
    const response = await fetch(request.url, {
        ...request.init,
        body,
        signal: AbortSignal.timeout(30_000),
    });
    await responseBytes(response);
    if (response.status !== expectedStatus) {
        throw new ClientFailure(`negative-probe-http-status-${response.status}`);
    }
}
