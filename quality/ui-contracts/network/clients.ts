import ts from "typescript";

export type NetworkTarget = {
    kind: "global" | "fetch" | "xhr" | "websocket" | "eventsource" | "client" | "method" | "namespace";
    name: string;
};

export const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "request"]);
const CLIENT_MODULES = new Set(["axios", "ky", "ofetch", "undici", "node-fetch", "cross-fetch"]);

export function importedTarget(declaration: ts.Declaration): NetworkTarget | undefined {
    let node: ts.Node = declaration;
    while (!ts.isImportDeclaration(node) && node.parent) {
        node = node.parent;
    }
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly) {
        return undefined;
    }
    const module = node.moduleSpecifier.text;
    if (!CLIENT_MODULES.has(module)) {
        return undefined;
    }
    if (ts.isNamespaceImport(declaration)) {
        return { kind: "namespace", name: module };
    }
    if (ts.isImportSpecifier(declaration) && declaration.isTypeOnly) {
        return undefined;
    }
    const name = ts.isImportSpecifier(declaration) ? (declaration.propertyName ?? declaration.name).text : "default";
    return clientExport(module, name);
}

export function clientExport(module: string, name: string): NetworkTarget | undefined {
    if ((module === "axios" || module === "ky") && name === "default") {
        return { kind: "client", name: module };
    }
    if (module === "ofetch" && ["default", "ofetch", "$fetch"].includes(name)) {
        return { kind: "client", name: "ofetch" };
    }
    if (
        (["node-fetch", "cross-fetch"].includes(module) && ["default", "fetch"].includes(name)) ||
        (module === "undici" && ["fetch", "request"].includes(name))
    ) {
        return { kind: "fetch", name: `${module}.${name}` };
    }
    return undefined;
}

export function globalTarget(name: string): NetworkTarget | undefined {
    if (["window", "globalThis", "self"].includes(name)) {
        return { kind: "global", name };
    }
    const globals: Record<string, NetworkTarget["kind"]> = {
        fetch: "fetch",
        XMLHttpRequest: "xhr",
        WebSocket: "websocket",
        EventSource: "eventsource",
    };
    const kind = globals[name];
    return kind ? { kind, name } : undefined;
}
