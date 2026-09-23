import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { ReleaseValidationError } from "../protocol/errors";

const SEGMENT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** V1 paths select the whole output or properties of closed objects. */
export function resolveConformancePath(
    schema: UlviaSchema,
    pointer: string,
    path: string,
    requireGuaranteed = false,
): UlviaSchema {
    if (pointer === "") {
        return schema;
    }
    if (!pointer.startsWith("/") || pointer === "/") {
        throw new ReleaseValidationError("invalid_contract", "expected an absolute object-property path", path);
    }
    let current = schema;
    for (const segment of pointer.slice(1).split("/")) {
        if (!SEGMENT.test(segment) || current.type !== "object" || (requireGuaranteed && current.nullable)) {
            throw new ReleaseValidationError("invalid_contract", "path must traverse object properties", path);
        }
        if (!Object.hasOwn(current.properties, segment) || (requireGuaranteed && !current.required.includes(segment))) {
            throw new ReleaseValidationError(
                "invalid_contract",
                requireGuaranteed
                    ? "path must select a required output property"
                    : "path selects an unknown output property",
                path,
            );
        }
        current = current.properties[segment]!;
    }
    return current;
}
