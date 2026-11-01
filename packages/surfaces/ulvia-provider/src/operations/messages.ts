import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import { errorMessage, isOfficialContract } from "../dispatch/errors/localize";
import { messageLanguage } from "../dispatch/errors/locale";
import type { ProviderOperationRecord } from "./types";

export function operationLanguage(record: ProviderOperationRecord) {
    return record.errorContentLanguage ?? messageLanguage(record.context.requestContext?.headers["accept-language"]);
}

export function operationFailureOutput(record: ProviderOperationRecord, code: string): { message: string } | undefined {
    if (!isOfficialContract(record.contractId)) {
        return undefined;
    }
    return {
        message: errorMessage(
            record.contractId,
            record.capabilityId,
            code,
            messageLanguage(record.context.requestContext?.headers["accept-language"]),
        ),
    };
}

/** Only the declared public message belongs in the operation detail response. */
export function operationMessage(record: ProviderOperationRecord): { message: string } | undefined {
    const output = record.errorOutput;
    if (
        output &&
        typeof output === "object" &&
        "message" in output &&
        typeof output.message === "string" &&
        output.message.length > 0 &&
        output.message.length <= 2048
    ) {
        return { message: output.message };
    }
    return record.errorCode ? operationFailureOutput(record, record.errorCode) : undefined;
}

/** Save the actual response language independently of later negotiation policy. */
export function operationErrorLanguage(record: ProviderOperationRecord, error?: unknown): string | undefined {
    if (error instanceof ProviderCapabilityDispatchError && error.responseHeaders["content-language"]) {
        return error.responseHeaders["content-language"];
    }
    return isOfficialContract(record.contractId)
        ? messageLanguage(record.context.requestContext?.headers["accept-language"])
        : undefined;
}
