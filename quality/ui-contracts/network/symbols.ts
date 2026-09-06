import ts from "typescript";

export function sourceSymbols(content: string, jsx = false) {
    const fileName = jsx ? "/ui-contract-source.tsx" : "/ui-contract-source.ts";
    const file = ts.createSourceFile(
        fileName,
        content,
        ts.ScriptTarget.Latest,
        true,
        jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const options: ts.CompilerOptions = { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
    const host: ts.CompilerHost = {
        getSourceFile: (name) => (name === fileName ? file : undefined),
        getDefaultLibFileName: () => "",
        writeFile: () => {},
        getCurrentDirectory: () => "/",
        getDirectories: () => [],
        fileExists: (name) => name === fileName,
        readFile: (name) => (name === fileName ? content : undefined),
        getCanonicalFileName: (name) => name,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
    };
    const checker = ts.createProgram([fileName], options, host).getTypeChecker();
    const written = new Set<ts.Symbol>();
    const mark = (node: ts.Node) => {
        if (ts.isIdentifier(node)) {
            const symbol = checker.getSymbolAtLocation(node);
            if (symbol) {
                written.add(symbol);
            }
        } else if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) {
            node.forEachChild(mark);
        }
    };
    const visit = (node: ts.Node) => {
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
            mark(node.left);
        }
        if (
            (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
            (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
        ) {
            mark(node.operand);
        }
        if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
            mark(node.initializer);
        }
        node.forEachChild(visit);
    };
    visit(file);
    return { file, checker, written };
}

export type SourceSymbols = ReturnType<typeof sourceSymbols>;
