import type { DataShape } from "../../interfaces/DataShape";
import { DataShapeProjectionError, projectStrictDataShape } from "../model/projectStrictDataShape";
import { isStructuredTriggerBody } from "./validateTriggerResponse";

export type TriggerResponseProjection = {
    body: unknown;
    byteLength: number;
};

export type TriggerResponseFinalizer = () => void | Promise<void>;

let triggerBodies: WeakMap<Response, TriggerResponseProjection> | undefined;
let triggerFinalizers: WeakMap<Response, TriggerResponseFinalizer[]> | undefined;

/** Associates a server-only trigger projection with the public response object. */
export function attachTriggerResponseBody(response: Response, body: unknown): void {
    (triggerBodies ??= new WeakMap()).set(response, {
        body,
        byteLength: new TextEncoder().encode(JSON.stringify(body)).byteLength,
    });
}

/**
 * Defers a server-side mutation until every synchronous blocking response
 * trigger has succeeded. Finalizers are tied to the original in-process
 * response and are never serialized or inherited by clones.
 */
export function attachTriggerResponseFinalizer(response: Response, finalizer: TriggerResponseFinalizer): void {
    const finalizers = (triggerFinalizers ??= new WeakMap());
    const existing = finalizers.get(response);
    if (existing) {
        existing.push(finalizer);
    } else {
        finalizers.set(response, [finalizer]);
    }
}

/** Runs attached finalizers once, in registration order. */
export async function runTriggerResponseFinalizers(response: Response): Promise<void> {
    const finalizers = triggerFinalizers?.get(response);
    if (!finalizers) {
        return;
    }
    triggerFinalizers!.delete(response);
    for (const finalizer of finalizers) {
        await finalizer();
    }
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
