import type { UlviaSchema } from "../../../interfaces/UlviaSchema";
import { ReleaseValidationError } from "../../protocol/errors";
import { expectString } from "../../protocol/values";

export function parsePointer(value: unknown, path: string): string {
    const pointer = value === "" ? "" : expectString(value, path, "invalid_contract", 1024);
    pointerSegments(pointer, path);
    return pointer;
}

/** Decode JSON Pointer segments once, including escaped slashes and tildes in map keys. */
function pointerSegments(pointer: string, path: string): readonly string[] {
    if (pointer === "") {
        return [];
    }
    if (!pointer.startsWith("/")) {
        throw new ReleaseValidationError("invalid_contract", "expected an absolute output path", path);
    }
    return pointer
        .slice(1)
        .split("/")
        .map((segment) => {
            if (/~(?![01])/.test(segment)) {
                throw new ReleaseValidationError("invalid_contract", "invalid JSON Pointer escape", path);
            }
            return segment.replace(/~1/g, "/").replace(/~0/g, "~");
        });
}

/** Captures need guaranteed presence unless a successful assertion establishes their exact path. */
export function resolveConformancePath(
    schema: UlviaSchema,
    pointer: string,
    path: string,
    requireGuaranteed = false,
): UlviaSchema {
    let current = schema;
    for (const segment of pointerSegments(pointer, path)) {
        if (requireGuaranteed && "nullable" in current && current.nullable) {
            throw new ReleaseValidationError("invalid_contract", "path traverses a nullable output", path);
        }
        if (current.type === "object") {
            if (!Object.hasOwn(current.properties, segment)) {
                throw new ReleaseValidationError("invalid_contract", "path selects an unknown output property", path);
            }
            const countRequiresAll = current.minProperties === Object.keys(current.properties).length;
            if (requireGuaranteed && !current.required.includes(segment) && !countRequiresAll) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "path must select a required output property",
                    path,
                );
            }
            current = current.properties[segment]!;
        } else if (current.type === "array") {
            if (!/^(0|[1-9][0-9]*)$/.test(segment) || !Number.isSafeInteger(Number(segment))) {
                throw new ReleaseValidationError("invalid_contract", "array path requires a canonical index", path);
            }
            const index = Number(segment);
            if (index >= current.maxItems || (requireGuaranteed && index >= (current.minItems ?? 0))) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "array index is outside guaranteed output bounds",
                    path,
                );
            }
            current = current.items;
        } else if (current.type === "map") {
            if (segment.length > current.maxKeyLength || current.maxProperties === 0 || requireGuaranteed) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "map key requires a presence assertion within bounds",
                    path,
                );
            }
            current = current.values;
        } else {
            throw new ReleaseValidationError(
                "invalid_contract",
                "path must traverse object properties, maps or arrays",
                path,
            );
        }
    }
    return current;
}
