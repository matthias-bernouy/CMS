import type {
    RepositoryOperatorClientConfig,
    RepositoryOperatorMutationSuccess,
    RepositoryOperatorRequest,
    RepositoryOperatorResult,
} from "./contracts";
import { invalidOperatorResponse, operatorHttpRequest, operatorUpstreamFailure, type OperatorHttpResult } from "./http";
import { parseMutationSuccess } from "./responses";

type MutationResult =
    | (Readonly<{ outcome: "completed" }> & RepositoryOperatorMutationSuccess)
    | Extract<RepositoryOperatorResult, { outcome: "failed" }>;

export async function getOperatorResource(
    config: RepositoryOperatorClientConfig,
    path: string,
    target: Readonly<{ kind: string; version: string }>,
    deadline: number,
    includeVersion = true,
): Promise<OperatorHttpResult> {
    const query = new URLSearchParams({ kind: target.kind, ...(includeVersion ? { version: target.version } : {}) });
    const result = await operatorHttpRequest(
        config,
        `${config.managementUrl}${path}?${query}`,
        { method: "GET" },
        deadline,
    );
    return "outcome" in result || result.response.status === 200 ? result : operatorUpstreamFailure(result);
}

export async function postOperatorMutation(
    config: RepositoryOperatorClientConfig,
    path: string,
    target: RepositoryOperatorRequest,
    value: Readonly<Record<string, unknown>>,
    deadline: number,
): Promise<MutationResult> {
    const body = new TextEncoder().encode(JSON.stringify(value));
    const result = await operatorHttpRequest(
        config,
        `${config.managementUrl}${path}`,
        {
            method: "POST",
            headers: { "content-length": String(body.byteLength), "content-type": "application/json" },
            body: body.buffer,
        },
        deadline,
    );
    if ("outcome" in result) {
        return result;
    }
    if (result.response.status !== 201) {
        return operatorUpstreamFailure(result);
    }
    const success = parseMutationSuccess(result.body, target);
    return success ? { outcome: "completed", ...success } : invalidOperatorResponse(result.response.status);
}
