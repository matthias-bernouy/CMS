import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import * as ts from "@typescript/typescript6";
import { declaredLoggerBindings, isLoggerCall } from "./loggerBindings";

const ROOT = resolve(import.meta.dir, "../..");
const ALLOWED = [
    /^packages\/features\/cms-content\/src\/browser\//u,
    /^packages\/features\/cms-content\/src\/runtime-assets\/generated\//u,
    /^packages\/runtimes\/ulvia-cli\/src\/(?:cli|index)\.ts$/u,
];
const EVENT_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const LOG_METHODS = new Set(["log", "trace", "debug", "info", "warn", "error", "fatal"]);

export async function findServerConsoleCalls(root = ROOT): Promise<string[]> {
    return findSourceViolations(root, consoleReferenceLines);
}

export async function findInvalidLogEvents(root = ROOT): Promise<string[]> {
    return findSourceViolations(root, invalidLogEventLines);
}

async function findSourceViolations(
    root: string,
    inspect: (path: string, source: string) => number[],
): Promise<string[]> {
    const findings: string[] = [];
    for await (const absolute of new Bun.Glob("packages/**/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}").scan({
        cwd: root,
        absolute: true,
    })) {
        const path = relative(root, absolute).replaceAll("\\", "/");
        if (ALLOWED.some((pattern) => pattern.test(path))) {
            continue;
        }
        const source = await readFile(absolute, "utf8");
        for (const line of inspect(path, source)) {
            findings.push(`${path}:${line}`);
        }
    }
    return findings.sort(compareFinding);
}

function compareFinding(left: string, right: string): number {
    const leftSeparator = left.lastIndexOf(":");
    const rightSeparator = right.lastIndexOf(":");
    const byPath = left.slice(0, leftSeparator).localeCompare(right.slice(0, rightSeparator));
    return byPath || Number(left.slice(leftSeparator + 1)) - Number(right.slice(rightSeparator + 1));
}

function invalidLogEventLines(path: string, source: string): number[] {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
    const loggerBindings = declaredLoggerBindings(file);
    const lines = new Set<number>();
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && isLoggerCall(node.expression, file, loggerBindings, LOG_METHODS)) {
            const method = node.expression.name.text;
            const event = node.arguments[method === "log" ? 1 : 0];
            if (!event || !isStableEventLiteral(event)) {
                lines.add(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return [...lines].sort((left, right) => left - right);
}

function isStableEventLiteral(node: ts.Expression): boolean {
    if (ts.isStringLiteralLike(node)) {
        return EVENT_PATTERN.test(node.text);
    }
    return ts.isNoSubstitutionTemplateLiteral(node) && EVENT_PATTERN.test(node.text);
}

function consoleReferenceLines(path: string, source: string): number[] {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
    const lines = new Set<number>();
    const visit = (node: ts.Node): void => {
        if (
            (ts.isIdentifier(node) && node.text === "console") ||
            (ts.isElementAccessExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === "globalThis" &&
                ts.isStringLiteralLike(node.argumentExpression) &&
                node.argumentExpression.text === "console")
        ) {
            lines.add(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return [...lines].sort((left, right) => left - right);
}

function scriptKind(path: string): ts.ScriptKind {
    if (/\.[cm]?tsx$/u.test(path)) {
        return ts.ScriptKind.TSX;
    }
    if (/\.[cm]?jsx$/u.test(path)) {
        return ts.ScriptKind.JSX;
    }
    if (/\.[cm]?js$/u.test(path)) {
        return ts.ScriptKind.JS;
    }
    return ts.ScriptKind.TS;
}

if (import.meta.main) {
    const [consoleFindings, eventFindings] = await Promise.all([findServerConsoleCalls(), findInvalidLogEvents()]);
    if (consoleFindings.length > 0) {
        console.error(
            `[logging][ERROR] Server code must use an injected Logger instead of referencing console:\n${consoleFindings.join("\n")}`,
        );
    }
    if (eventFindings.length > 0) {
        console.error(`[logging][ERROR] Logger events must be stable lowercase literals:\n${eventFindings.join("\n")}`);
    }
    if (consoleFindings.length === 0 && eventFindings.length === 0) {
        console.log("[logging][PASS] Server packages contain no direct console calls.");
    }
    if (consoleFindings.length > 0 || eventFindings.length > 0) {
        process.exitCode = 1;
    }
}
