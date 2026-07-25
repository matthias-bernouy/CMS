import { type Node as JsonNode, type ParseError, parseTree, printParseErrorCode } from "jsonc-parser";
import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import { IntegrationPackageValidationError } from "./errors";

const utf8 = new TextEncoder();
const utf8Fatal = new TextDecoder("utf-8", { fatal: true });

export function parseStrictPackageJson(
    input: string | Uint8Array,
    limits: Readonly<IntegrationPackageLimits>,
): unknown {
    const bytes = typeof input === "string" ? utf8.encode(input) : input;
    if (bytes.byteLength > limits.maxDocumentBytes) {
        throw new IntegrationPackageValidationError(
            "body_limit_exceeded",
            `JSON document exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    if (hasUtf8Bom(bytes)) {
        throw new IntegrationPackageValidationError("invalid_json", "JSON document must not contain a BOM");
    }
    let source: string;
    try {
        source = typeof input === "string" ? input : utf8Fatal.decode(input);
    } catch {
        throw new IntegrationPackageValidationError("invalid_utf8", "JSON document must be valid UTF-8");
    }
    if (source.charCodeAt(0) === 0xfeff) {
        throw new IntegrationPackageValidationError("invalid_json", "JSON document must not contain a BOM");
    }

    const errors: ParseError[] = [];
    const tree = parseTree(source, errors, {
        allowEmptyContent: false,
        allowTrailingComma: false,
        disallowComments: true,
    });
    const firstError = errors[0];
    if (!tree || firstError) {
        const detail = firstError
            ? `${printParseErrorCode(firstError.error)} at byte ${firstError.offset}`
            : "empty document";
        throw new IntegrationPackageValidationError("invalid_json", `malformed JSON (${detail})`);
    }
    assertNoDuplicateProperties(tree, "$");
    return JSON.parse(source) as unknown;
}

function assertNoDuplicateProperties(node: JsonNode, path: string): void {
    if (node.type === "object") {
        const seen = new Set<string>();
        for (const property of node.children ?? []) {
            const keyNode = property.children?.[0];
            const valueNode = property.children?.[1];
            if (!keyNode || typeof keyNode.value !== "string" || !valueNode) {
                throw new IntegrationPackageValidationError("invalid_json", "malformed JSON object property");
            }
            const key = keyNode.value;
            if (seen.has(key)) {
                throw new IntegrationPackageValidationError(
                    "duplicate_json_property",
                    `duplicate property ${JSON.stringify(key)} at ${path}`,
                    `${path}.${key}`,
                );
            }
            seen.add(key);
            assertNoDuplicateProperties(valueNode, `${path}.${key}`);
        }
        return;
    }
    if (node.type === "array") {
        for (const [index, child] of (node.children ?? []).entries()) {
            assertNoDuplicateProperties(child, `${path}[${index}]`);
        }
    }
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
    return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}
