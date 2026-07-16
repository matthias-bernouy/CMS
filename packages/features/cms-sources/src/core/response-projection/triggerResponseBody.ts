import type { DataShape } from "../../interfaces/DataShape";
import { DataShapeProjectionError, projectStrictDataShape } from "../projectStrictDataShape";
import { isStructuredTriggerBody } from "./validateTriggerResponse";

export type TriggerResponseProjection = {
    body: unknown;
    byteLength: number;
};

let triggerBodies: WeakMap<Response, TriggerResponseProjection> | undefined;

/** Associates a server-only trigger projection with the public response object. */
export function attachTriggerResponseBody(response: Response, body: unknown): void {
    (triggerBodies ??= new WeakMap()).set(response, {
        body,
        byteLength: new TextEncoder().encode(JSON.stringify(body)).byteLength,
    });
}

/** Projects and attaches the complete body visible only to in-process response triggers. */
export function attachProjectedTriggerResponseBody(
    response: Response,
    rawBody: unknown,
    publicBody: unknown,
    triggerShape: DataShape,
): void {
    if (!isStructuredTriggerBody(triggerShape) || !isRecord(publicBody)) {
        throw new DataShapeProjectionError("$trigger must extend a structured public object");
    }
    const triggerFields = projectStrictDataShape(rawBody, triggerShape, "$trigger");
    attachTriggerResponseBody(response, {
        ...(publicBody as Record<string, unknown>),
        ...(triggerFields as Record<string, unknown>),
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the sidecar only for the original in-process response; clones do not inherit it. */
export function triggerResponseProjection(response: Response): TriggerResponseProjection | undefined {
    return triggerBodies?.get(response);
}
