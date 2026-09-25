import type { CapabilityErrorDefinition } from "../../../interfaces/ContractRelease";
import type { CapabilityHttpMethod, CompiledHttpErrorEnvelope } from "../../../interfaces/HttpBinding";
import { ReleaseValidationError } from "../../protocol/errors";
import { assertJsonCompatible } from "../jsonCompatibility";

export function errorEnvelope(method: CapabilityHttpMethod): CompiledHttpErrorEnvelope {
    return method === "HEAD"
        ? {
              kind: "headers",
              encoding: "json-percent",
              codeHeader: "x-ulvia-error-code",
              requestIdHeader: "x-ulvia-request-id",
          }
        : { kind: "json" };
}

export function compileErrorStatuses(
    mappings: Readonly<Record<string, number>>,
    errors: readonly CapabilityErrorDefinition[],
    method: CapabilityHttpMethod,
    path: string,
): Readonly<Record<string, number>> {
    const declared = errors.map((error) => error.code).sort();
    const mapped = Object.keys(mappings).sort();
    if (declared.length !== mapped.length || declared.some((code, index) => code !== mapped[index])) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `error status mappings must exactly match declared errors: ${declared.join(", ") || "none"}`,
            path,
        );
    }
    const compiled: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const error of errors) {
        const status = mappings[error.code]!;
        if (status < 400 || status > 599) {
            throw new ReleaseValidationError(
                "invalid_binding",
                "error statuses must be 4xx or 5xx",
                `${path}.${error.code}`,
            );
        }
        if (error.output) {
            if (method === "HEAD" && error.output.type !== "null") {
                throw new ReleaseValidationError(
                    "invalid_binding",
                    "HEAD error responses require a null output schema",
                    `${path}.${error.code}.output`,
                );
            }
            assertJsonCompatible(error.output, `${path}.${error.code}.output`);
        }
        compiled[error.code] = status;
    }
    return compiled;
}
