import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import type { ErrorMessageKey } from "./catalogue/index";
import { ERROR_MESSAGES } from "./catalogue/index";

export type FailureReason = Readonly<{
    code: string;
    parameters?: Readonly<Record<string, string | number>>;
}>;
const reasons = new WeakMap<ProviderCapabilityDispatchError, FailureReason>();

/** Private semantic reason: never serialize causes, diagnostic strings or parameters. */
export function officialFailure(
    code: string,
    status: number,
    source?: unknown,
    reason?: Readonly<{ code: ErrorMessageKey; parameters?: FailureReason["parameters"] }>,
    headers: Readonly<Record<string, string>> = {},
): ProviderCapabilityDispatchError {
    const issue = reason ?? (source instanceof Error && "issue" in source ? source.issue : undefined);
    const diagnostic =
        issue &&
        typeof issue === "object" &&
        "code" in issue &&
        typeof issue.code === "string" &&
        Object.hasOwn(ERROR_MESSAGES, issue.code)
            ? issue.code
            : undefined;
    const error = new ProviderCapabilityDispatchError(code, status, code, headers, undefined, diagnostic);
    if (issue && typeof issue === "object" && "code" in issue && typeof issue.code === "string") {
        reasons.set(error, issue as FailureReason);
    }
    return error;
}

export function failureReason(error: ProviderCapabilityDispatchError): FailureReason | undefined {
    return reasons.get(error);
}
