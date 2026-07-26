import { IntegrationPackageValidationError } from "@bernouy/cms-integration-packages";

export type IntegrationVerificationContractErrorCode =
    | "invalid_contract"
    | "invalid_digest"
    | "invalid_json"
    | "invalid_reference"
    | "invalid_schema"
    | "limit_exceeded";

export class IntegrationVerificationContractError extends TypeError {
    readonly code: IntegrationVerificationContractErrorCode;
    readonly field?: string;

    constructor(code: IntegrationVerificationContractErrorCode, message: string, field?: string) {
        super(`Invalid integration verification contract: ${message}`);
        this.name = "IntegrationVerificationContractError";
        this.code = code;
        this.field = field;
    }
}

export function wrapPackageValidation<T>(action: () => T): T {
    try {
        return action();
    } catch (error) {
        if (!(error instanceof IntegrationPackageValidationError)) {
            throw error;
        }
        const code = error.code === "invalid_schema" ? "invalid_schema" : packageErrorCode(error.code);
        throw new IntegrationVerificationContractError(code, error.message, error.field);
    }
}

function packageErrorCode(code: IntegrationPackageValidationError["code"]): IntegrationVerificationContractErrorCode {
    if (code.includes("limit_exceeded")) {
        return "limit_exceeded";
    }
    if (code === "invalid_json" || code === "invalid_utf8" || code === "duplicate_json_property") {
        return "invalid_json";
    }
    return "invalid_contract";
}
