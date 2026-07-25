import { type Node as JsonNode, type ParseError, createScanner, parseTree, printParseErrorCode } from "jsonc-parser";
import { MAX_I_JSON_NESTING_DEPTH } from "../canonical/assertIJson";
import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import { IntegrationPackageValidationError } from "./errors";

const utf8 = new TextEncoder();
const utf8Fatal = new TextDecoder("utf-8", { fatal: true });
const JSON_TOKEN = {
    openBrace: 1,
    closeBrace: 2,
    openBracket: 3,
    closeBracket: 4,
    end: 17,
} as const;

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
    assertBoundedJsonDepth(source);

    const errors: ParseError[] = [];
    const tree = parseTree(source, errors, {
        allowEmptyContent: false,
        allowTrailingComma: false,
        disallowComments: true,
    });
    const firstError = errors[0];
    if (!tree || firstError) {
        const detail = firstError
            ? `${printParseErrorCode(firstError.error)} at UTF-16 offset ${firstError.offset}`
            : "empty document";
        throw new IntegrationPackageValidationError("invalid_json", `malformed JSON (${detail})`);
    }
    assertNoDuplicateProperties(tree);
    return JSON.parse(source) as unknown;
}

function assertBoundedJsonDepth(source: string): void {
    const scanner = createScanner(source, false);
    let depth = 0;
    while (true) {
        const token = scanner.scan();
        if (token === JSON_TOKEN.end) {
            return;
        }
        if (token === JSON_TOKEN.openBrace || token === JSON_TOKEN.openBracket) {
            depth += 1;
            if (depth > MAX_I_JSON_NESTING_DEPTH) {
                throw new IntegrationPackageValidationError(
                    "json_depth_limit_exceeded",
                    `JSON document exceeds nesting depth ${MAX_I_JSON_NESTING_DEPTH}`,
                );
            }
        } else if (token === JSON_TOKEN.closeBrace || token === JSON_TOKEN.closeBracket) {
            depth = Math.max(0, depth - 1);
        }
    }
}

function assertNoDuplicateProperties(root: JsonNode): void {
    const stack: Array<{ node: JsonNode; path: string }> = [{ node: root, path: "$" }];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            break;
        }
        const { node, path } = current;
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
                stack.push({ node: valueNode, path: `${path}.${key}` });
            }
            continue;
        }
        if (node.type === "array") {
            for (const [index, child] of (node.children ?? []).entries()) {
                stack.push({ node: child, path: `${path}[${index}]` });
            }
        }
    }
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
    return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}
