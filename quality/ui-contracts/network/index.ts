import ts from "typescript";
import type { UiFinding, UiSource } from "../contracts/types";
import { inlineScripts, type ScriptExcerpt } from "./inlineScripts";
import { networkPolicy } from "./policy";
import { networkResolver } from "./resolution";
import { sourceSymbols } from "./symbols";

export function inspectNetwork(source: UiSource): UiFinding[] {
    if (!source.browser) {
        return [];
    }
    const excerpts = source.kind === "html" ? inlineScripts(source.content) : [{ content: source.content, offset: 0 }];
    return excerpts.flatMap((excerpt) => inspectScript(source, excerpt));
}

function inspectScript(source: UiSource, { content, offset }: ScriptExcerpt): UiFinding[] {
    if (
        !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|axios|ky|ofetch|undici|cross-fetch|node-fetch)\b/.test(
            content,
        )
    ) {
        return [];
    }
    const symbols = sourceSymbols(content, /\.[jt]sx$/.test(source.path));
    const resolve = networkResolver(symbols);
    const findings: UiFinding[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            const target = resolve(node.expression);
            const request = ts.isCallExpression(node) && target && ["fetch", "client", "method"].includes(target.kind);
            const connection =
                ts.isNewExpression(node) && target && ["xhr", "websocket", "eventsource"].includes(target.kind);
            if (target && (request || connection)) {
                const start = node.expression.getStart(symbols.file);
                const prefix = source.content.slice(0, offset + start);
                const line = prefix.split("\n").length;
                const column = prefix.length - prefix.lastIndexOf("\n");
                findings.push({
                    ...networkPolicy(source.path, target),
                    file: source.path,
                    line,
                    column,
                    evidence: content.slice(node.getStart(symbols.file), node.end).replace(/\s+/g, " ").slice(0, 220),
                });
            }
        }
        node.forEachChild(visit);
    };
    visit(symbols.file);
    return findings;
}
