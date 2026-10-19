import * as ts from "@typescript/typescript6";

const LOGGER_FACTORIES = new Set(["createLogger", "createNodeLogger"]);

export type LoggerBindings = Readonly<{
    identifiers: ReadonlySet<string>;
    properties: ReadonlySet<string>;
}>;

export function declaredLoggerBindings(file: ts.SourceFile): LoggerBindings {
    const identifiers = new Set<string>();
    const properties = new Set<string>();
    visit(file, (node) => {
        if (!declaresLoggerType(node, file) || !ts.isIdentifier(node.name)) {
            return;
        }
        identifiers.add(node.name.text);
        if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isParameter(node)) {
            properties.add(node.name.text);
        }
    });
    let changed = true;
    while (changed) {
        changed = false;
        visit(file, (node) => {
            if (!ts.isVariableDeclaration(node) && !ts.isPropertyDeclaration(node)) {
                return;
            }
            if (!ts.isIdentifier(node.name) || !node.initializer || !isLoggerExpression(node.initializer, bindings())) {
                return;
            }
            const target = ts.isPropertyDeclaration(node) ? properties : identifiers;
            if (!target.has(node.name.text)) {
                target.add(node.name.text);
                changed = true;
            }
        });
    }
    return bindings();

    function bindings(): LoggerBindings {
        return { identifiers, properties };
    }
}

export function isLoggerCall(
    expression: ts.LeftHandSideExpression,
    file: ts.SourceFile,
    bindings: LoggerBindings,
    methods: ReadonlySet<string>,
): expression is ts.PropertyAccessExpression {
    return (
        ts.isPropertyAccessExpression(expression) &&
        methods.has(expression.name.text) &&
        isLoggerExpression(expression.expression, bindings, file)
    );
}

function declaresLoggerType(
    node: ts.Node,
    file: ts.SourceFile,
): node is ts.VariableDeclaration | ts.ParameterDeclaration | ts.PropertyDeclaration | ts.PropertySignature {
    return (
        (ts.isVariableDeclaration(node) ||
            ts.isParameter(node) ||
            ts.isPropertyDeclaration(node) ||
            ts.isPropertySignature(node)) &&
        !!node.type &&
        /\bLogger\b/u.test(node.type.getText(file))
    );
}

function isLoggerExpression(expression: ts.Expression, bindings: LoggerBindings, file?: ts.SourceFile): boolean {
    if (ts.isIdentifier(expression)) {
        return bindings.identifiers.has(expression.text) || expression.text.toLowerCase().includes("logger");
    }
    if (ts.isPropertyAccessExpression(expression)) {
        return (
            bindings.properties.has(expression.name.text) ||
            expression.name.text.toLowerCase().includes("logger") ||
            (expression.name.text === "logger" && isLoggerExpression(expression.expression, bindings, file))
        );
    }
    if (!ts.isCallExpression(expression)) {
        return file ? expression.getText(file).toLowerCase().includes("logger") : false;
    }
    if (ts.isIdentifier(expression.expression) && LOGGER_FACTORIES.has(expression.expression.text)) {
        return true;
    }
    return (
        ts.isPropertyAccessExpression(expression.expression) &&
        expression.expression.name.text === "child" &&
        isLoggerExpression(expression.expression.expression, bindings, file)
    );
}

function visit(root: ts.Node, callback: (node: ts.Node) => void): void {
    const walk = (node: ts.Node): void => {
        callback(node);
        ts.forEachChild(node, walk);
    };
    walk(root);
}
