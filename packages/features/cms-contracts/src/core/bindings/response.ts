import { ReleaseValidationError } from "../protocol/errors";
import { MEDIA_TYPE_PATTERN } from "../schema/context";
import type { CapabilityErrorDefinition, CapabilityExecution } from "../../interfaces/ContractRelease";
import type { CapabilityHttpMethod, CompiledHttpResponse, HttpResponseBinding } from "../../interfaces/HttpBinding";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { assertJsonCompatible } from "./jsonCompatibility";

export function compileResponse(
    binding: HttpResponseBinding,
    errors: readonly CapabilityErrorDefinition[],
    output: UlviaSchema,
    execution: CapabilityExecution,
    method: CapabilityHttpMethod,
    path: string,
): CompiledHttpResponse {
    const statuses = uniqueSorted(binding.successStatuses, `${path}.successStatuses`);
    if (statuses.some((status) => status < 200 || status > 299)) {
        throw new ReleaseValidationError("invalid_binding", "success statuses must be 2xx", `${path}.successStatuses`);
    }
    const contentTypes = [...binding.contentTypes].sort();
    const errorStatuses = compileErrorStatuses(binding.errorStatuses, errors, method, `${path}.errorStatuses`);
    if (
        new Set(contentTypes).size !== contentTypes.length ||
        contentTypes.some((type) => !MEDIA_TYPE_PATTERN.test(type))
    ) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "content types must be unique lowercase media types without parameters",
            `${path}.contentTypes`,
        );
    }
    if (output.type === "binary" && output.nullable) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "binary response outputs must be non-nullable",
            `${path}.output`,
        );
    }
    if (execution === "operation") {
        if (output.type !== "binary") {
            assertJsonCompatible(output, `${path}.output`);
        }
        return compileOperationResponse(statuses, contentTypes, errorStatuses, method, path);
    }
    if (statuses.includes(202)) {
        throw new ReleaseValidationError("invalid_binding", "status 202 requires operation execution", path);
    }
    if (method === "HEAD") {
        if (output.type !== "null") {
            throw new ReleaseValidationError("invalid_binding", "HEAD responses require a null output schema", path);
        }
        if (contentTypes.length > 0) {
            throw new ReleaseValidationError("invalid_binding", "HEAD responses cannot declare content types", path);
        }
        return { kind: "result", successStatuses: statuses, contentTypes, errorStatuses };
    }
    const bodylessStatuses = statuses.filter((status) => status === 204 || status === 205);
    if (bodylessStatuses.length > 0 && contentTypes.length > 0) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `status ${bodylessStatuses.join(", ")} cannot declare a response content type`,
            path,
        );
    }
    if (output.type === "binary") {
        if (contentTypes.length === 0 || contentTypes.some((type) => !output.mediaTypes.includes(type))) {
            throw new ReleaseValidationError(
                "invalid_binding",
                "binary response content types must be declared by the output schema",
                `${path}.contentTypes`,
            );
        }
    } else if (output.type === "null" && contentTypes.length === 0) {
        if (statuses.some((status) => status !== 204 && status !== 205)) {
            throw new ReleaseValidationError(
                "invalid_binding",
                "bodyless null responses must use status 204 or 205",
                path,
            );
        }
    } else {
        if (contentTypes.length !== 1 || contentTypes[0] !== "application/json") {
            throw new ReleaseValidationError(
                "invalid_binding",
                "JSON responses must declare only application/json",
                path,
            );
        }
        assertJsonCompatible(output, `${path}.output`);
    }
    if (output.type !== "null" && bodylessStatuses.length > 0) {
        throw new ReleaseValidationError(
            "invalid_binding",
            `status ${bodylessStatuses.join(", ")} requires a null output schema`,
            path,
        );
    }
    return { kind: "result", successStatuses: statuses, contentTypes, errorStatuses };
}

function compileOperationResponse(
    statuses: readonly number[],
    contentTypes: readonly string[],
    errorStatuses: Readonly<Record<string, number>>,
    method: CapabilityHttpMethod,
    path: string,
): CompiledHttpResponse {
    if (method === "HEAD") {
        throw new ReleaseValidationError("invalid_binding", "operation capabilities cannot use HEAD", path);
    }
    if (statuses.length !== 1 || statuses[0] !== 202) {
        throw new ReleaseValidationError("invalid_binding", "operation responses must declare only status 202", path);
    }
    if (contentTypes.length !== 1 || contentTypes[0] !== "application/json") {
        throw new ReleaseValidationError(
            "invalid_binding",
            "operation responses must declare only application/json",
            path,
        );
    }
    return { kind: "operation-handle", successStatuses: statuses, contentTypes, errorStatuses };
}

function compileErrorStatuses(
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

function uniqueSorted(values: readonly number[], path: string): readonly number[] {
    if (new Set(values).size !== values.length) {
        throw new ReleaseValidationError("invalid_binding", "must not contain duplicates", path);
    }
    return [...values].sort((left, right) => left - right);
}
