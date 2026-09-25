import { type Node as JsonNode, type ParseError, createScanner, parseTree, printParseErrorCode } from "jsonc-parser";
import { ReleaseValidationError } from "./errors";

const encoder = new TextEncoder();
const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
const JSON_TOKEN = {
    openBrace: 1,
    closeBrace: 2,
    openBracket: 3,
    closeBracket: 4,
    end: 17,
} as const;

export function parseStrictJson(input: string | Uint8Array, maxDocumentBytes: number, maxDepth: number): unknown {
    if (!Number.isSafeInteger(maxDocumentBytes) || maxDocumentBytes <= 0) {
        throw new TypeError("JSON byte limit must be a positive safe integer");
    }
    const bytes = typeof input === "string" ? encoder.encode(input) : input;
    if (bytes.byteLength > maxDocumentBytes) {
        throw new ReleaseValidationError("body_limit_exceeded", `document exceeds ${maxDocumentBytes} bytes`);
    }
    if (hasUtf8Bom(bytes)) {
        throw new ReleaseValidationError("invalid_json", "document must not contain a BOM");
    }
    let source: string;
    try {
        source = typeof input === "string" ? input : fatalDecoder.decode(input);
    } catch {
        throw new ReleaseValidationError("invalid_utf8", "document must be valid UTF-8");
    }
    if (source.charCodeAt(0) === 0xfeff) {
        throw new ReleaseValidationError("invalid_json", "document must not contain a BOM");
    }
    assertJsonDepth(source, maxDepth);
    const errors: ParseError[] = [];
    const tree = parseTree(source, errors, {
        allowEmptyContent: false,
        allowTrailingComma: false,
        disallowComments: true,
    });
    if (!tree || errors[0]) {
        const error = errors[0];
        const detail = error
            ? `${printParseErrorCode(error.error)} at UTF-16 offset ${error.offset}`
            : "empty document";
        throw new ReleaseValidationError("invalid_json", `malformed JSON (${detail})`);
    }
    assertNoDuplicateProperties(tree);
    return JSON.parse(source) as unknown;
}

function assertJsonDepth(source: string, maximum: number): void {
    if (!Number.isSafeInteger(maximum) || maximum <= 0) {
        throw new TypeError("JSON depth limit must be a positive safe integer");
    }
    const scanner = createScanner(source, false);
    let depth = 0;
    while (true) {
        const token = scanner.scan();
        if (token === JSON_TOKEN.end) {
            return;
        }
        if (token === JSON_TOKEN.openBrace || token === JSON_TOKEN.openBracket) {
            depth += 1;
            if (depth > maximum) {
                throw new ReleaseValidationError(
                    "json_depth_limit_exceeded",
                    `document exceeds nesting depth ${maximum}`,
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
        const current = stack.pop()!;
        if (current.node.type === "array") {
            for (const [index, child] of (current.node.children ?? []).entries()) {
                stack.push({ node: child, path: `${current.path}[${index}]` });
            }
            continue;
        }
        if (current.node.type !== "object") {
            continue;
        }
        const seen = new Set<string>();
        for (const property of current.node.children ?? []) {
            const keyNode = property.children?.[0];
            const valueNode = property.children?.[1];
            if (!keyNode || typeof keyNode.value !== "string" || !valueNode) {
                throw new ReleaseValidationError("invalid_json", "malformed object property", current.path);
            }
            if (seen.has(keyNode.value)) {
                throw new ReleaseValidationError(
                    "duplicate_json_property",
                    `duplicate property ${JSON.stringify(keyNode.value)}`,
                    current.path,
                );
            }
            seen.add(keyNode.value);
            stack.push({ node: valueNode, path: `${current.path}.${keyNode.value}` });
        }
    }
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
    return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}
