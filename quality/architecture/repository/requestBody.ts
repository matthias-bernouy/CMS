import { resolve, relative } from "node:path";
import * as ts from "@typescript/typescript6";

const READERS = new Set(["json", "text", "arrayBuffer", "blob", "bytes", "formData"]);
const BOUNDED_READER = "packages/foundation/http-runner/src/core/request/body.ts";

/** Only proven built-in Request receivers are blocking; any/unresolved types require human review. */
export function requestBodyFindings(program: ts.Program, files: readonly string[]): string[] {
    const checker = program.getTypeChecker();
    const findings: string[] = [];
    for (const path of files) {
        const source = program.getSourceFile(path);
        if (!source) {
            throw new Error(`Request body guard could not load ${path}`);
        }
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node)) {
                const call = node.expression;
                const target =
                    ts.isPropertyAccessExpression(call) || ts.isElementAccessExpression(call) ? call.expression : null;
                const method = ts.isPropertyAccessExpression(call)
                    ? call.name.text
                    : ts.isElementAccessExpression(call) && ts.isStringLiteralLike(call.argumentExpression)
                      ? call.argumentExpression.text
                      : null;
                if (target && method && READERS.has(method)) {
                    const type = checker.getNonNullableType(checker.getTypeAtLocation(target));
                    const builtin = type
                        .getSymbol()
                        ?.declarations?.some(
                            (declaration) =>
                                /\/lib\.dom\.d\.ts$/.test(declaration.getSourceFile().fileName.replaceAll("\\", "/")) &&
                                ts.isInterfaceDeclaration(declaration) &&
                                declaration.name.text === "Request",
                        );
                    if (builtin) {
                        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                        findings.push(
                            `${path}:${line}: Request.${method} bypasses the body limit; use readBoundedRequestBody or readBoundedFormData.`,
                        );
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return findings;
}

export async function checkRequestBodyLimits(root: string): Promise<void> {
    const files = [
        ...new Bun.Glob("packages/**/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}").scanSync({ cwd: root, absolute: true }),
    ]
        .filter((path) => {
            const local = relative(root, path).replaceAll("\\", "/");
            return (
                local !== BOUNDED_READER &&
                !/\/(?:tests?|tooling|browser|runtime-assets)\/|\.(?:test|spec)\.[jt]sx?$/.test(local)
            );
        })
        .sort();
    const program = ts.createProgram(files, {
        noEmit: true,
        noResolve: true,
        allowJs: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ESNext,
        lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
    });
    const findings = requestBodyFindings(program, files);
    if (findings.length) {
        throw new Error(
            `Unbounded Request body reads:\n${findings.map((finding) => relative(resolve(root), finding)).join("\n")}`,
        );
    }
}
