import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { parseDataShape, type DataShape } from "@bernouy/cms-sources";

/** Parse a JSON-blob form field into a `DataShape`, or `undefined` when blank.
 *  Used for the per-endpoint `body` / `output` hidden fields. The JSON unwrapping
 *  is surface parsing (InvalidParam); the shape rules (type whitelist, depth/node
 *  caps, proto guard) are the gateway's `parseDataShape`. */
export function parseShapeField(raw: unknown, path: string): DataShape | undefined {
    if (raw == null || raw === "") {
        return undefined;
    }
    if (typeof raw !== "string") {
        throw new InvalidParam(path, "expected a JSON string");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new InvalidParam(path, "invalid JSON");
    }
    return parseDataShape(parsed, path);
}
