import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { responseBytes } from "../transport/http";
import type { ClientCall, Observation } from "./types";
import { ClientFailure } from "./failure";
import { parseCapabilityOperationHandle } from "@bernouy/ulvia-contracts/protocol";
import { abortable } from "./operation";

export async function observe(
    call: ClientCall,
    traceId: string,
    requestBytes: number,
    send: (signal: AbortSignal) => Promise<Response>,
    decode: (bytes: Uint8Array, response: Response) => unknown,
): Promise<Observation> {
    let status = 0;
    let size = 0;
    let streamConsumed = false;
    let validated = false;
    let completed = false;
    let failure: string | undefined;
    let durationMs: number | undefined;
    const polls: Observation[] = [];
    const asynchronous = call.target.definition.behavior.execution === "operation";
    const timeout = AbortSignal.timeout(call.timeoutMs ?? 30_000);
    const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
    const started = performance.now();
    try {
        const response = await send(signal);
        status = response.status;
        const bytes = await responseBytes(response);
        size = bytes.byteLength;
        streamConsumed = true;
        call.captureHeaders?.(response.headers);
        if (!response.ok) {
            failure = `http-status-${status}`;
        } else if (asynchronous && !call.complete) {
            failure = "operation-completion-adapter-required";
        } else {
            let output = decode(bytes, response);
            if (asynchronous) {
                let operationId: string;
                try {
                    operationId = parseCapabilityOperationHandle(output).operationId;
                } catch {
                    throw new ClientFailure("operation-handle-invalid");
                }
                output = await abortable(
                    call.complete!(operationId, signal, (poll) => polls.push(poll)),
                    signal,
                );
                if (
                    !polls.length ||
                    polls.length > 150 ||
                    new Set(polls.map((poll) => poll.traceId)).size !== polls.length ||
                    polls.some(
                        (poll) =>
                            poll.traceId === traceId ||
                            !poll.validated ||
                            !poll.completed ||
                            !poll.streamConsumed ||
                            ![poll.durationMs, poll.requestBytes, poll.responseBytes].every(
                                (value) => Number.isFinite(value) && value >= 0,
                            ),
                    )
                ) {
                    throw new ClientFailure("operation-poll-evidence-incomplete");
                }
            }
            try {
                validateSchemaValue(call.target.definition.output, output);
            } catch {
                throw new ClientFailure("output-schema-invalid");
            }
            durationMs = performance.now() - started;
            try {
                await call.assert(output);
            } catch (error) {
                throw error instanceof ClientFailure ? error : new ClientFailure("business-postcondition-failed");
            }
            validated = true;
            completed = true;
        }
    } catch (error) {
        // Do not persist messages from remote errors or fixture assertions: they may contain credentials or payloads.
        failure =
            error instanceof ClientFailure
                ? error.code
                : error instanceof Error && error.name === "TimeoutError"
                  ? "timeout"
                  : "transport-output-or-postcondition-failed";
    }
    return {
        traceId,
        durationMs: durationMs ?? performance.now() - started,
        requestBytes: requestBytes + polls.reduce((sum, poll) => sum + poll.requestBytes, 0),
        responseBytes: size + polls.reduce((sum, poll) => sum + poll.responseBytes, 0),
        status,
        validated,
        completed,
        streamConsumed,
        ...(failure ? { failure } : {}),
        ...(asynchronous
            ? { operation: { polls: polls.length }, relatedTraces: polls.map((poll) => poll.traceId) }
            : {}),
    };
}
