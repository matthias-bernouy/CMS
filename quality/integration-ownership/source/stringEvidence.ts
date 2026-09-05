import * as ts from "typescript";
import { toRelativePath } from "../../architecture/core/pathUtils";
import { lineOf } from "../../architecture/core/sourceImports";
import type {
    IntegrationCatalog,
    IntegrationIdentifierCategory,
    IntegrationIdentifierOwner,
    IntegrationOwnershipFinding,
} from "../types";

interface StringEvidenceOptions {
    blocTags: readonly string[];
    catalog: IntegrationCatalog;
    findings: IntegrationOwnershipFinding[];
    inspectKinds: boolean;
    kinds: ReadonlySet<string>;
    repositoryRoot: string;
    sourceFile: ts.SourceFile;
}

export function checkStringEvidence(options: StringEvidenceOptions): void {
    const { blocTags, catalog, findings, inspectKinds, kinds, repositoryRoot, sourceFile } = options;
    const visit = (node: ts.Node): void => {
        if (isTextLiteral(node)) {
            checkLiteral(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    function checkLiteral(node: ts.StringLiteralLike): void {
        const text = node.text;
        if (text.replaceAll("\\", "/").includes("packages/resources/official-integrations/integrations")) {
            addFinding(node, "high", "integration-authoring-path", [], "References the integration authoring tree.");
        }
        if (inspectKinds && kinds.has(text) && isIntegrationKindContext(node)) {
            addFinding(node, "review", "integration-kind", [text], `Selects integration kind \"${text}\".`);
        }

        const candidates = new Set([text]);
        if (text.includes("<")) {
            for (const tag of blocTags) {
                if (text.includes(`<${tag}`) || text.includes(`</${tag}`)) {
                    candidates.add(tag);
                }
            }
        }
        for (const identifier of candidates) {
            const owners = catalog.identifiers.get(identifier) ?? [];
            const ownerKinds = [...new Set(owners.map(({ kind }) => kind))];
            if (ownerKinds.length !== 1) {
                continue;
            }
            const matchingOwner = owners.find((owner) => matchesResourceLiteral(text, identifier, owner, node));
            if (!matchingOwner) {
                continue;
            }
            addFinding(
                node,
                "review",
                "integration-resource",
                ownerKinds,
                `References ${matchingOwner.category} \"${identifier}\" owned by integration \"${ownerKinds[0]}\".`,
            );
        }
    }

    function addFinding(
        node: ts.Node,
        confidence: "high" | "review",
        evidence: IntegrationOwnershipFinding["evidence"],
        owners: readonly string[],
        message: string,
    ): void {
        findings.push({
            confidence,
            evidence,
            file: toRelativePath(repositoryRoot, sourceFile.fileName),
            line: lineOf(sourceFile, node),
            message,
            owners,
        });
    }
}

function isIntegrationKindContext(node: ts.StringLiteralLike): boolean {
    const parent = node.parent;
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const name = propertyName(parent.name);
        return name === "kind" || /integration.*(?:id|kind)|(?:id|kind).*integration/i.test(name);
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
        return /integration.*(?:id|kind)|(?:id|kind).*integration/i.test(parent.name.text);
    }
    const call = findCallArgument(node);
    if (!call) {
        return false;
    }
    if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "get") {
        return true;
    }
    return /integration|definition|repository|catalog/i.test(call.expression.getText());
}

function matchesResourceLiteral(
    text: string,
    identifier: string,
    owner: IntegrationIdentifierOwner,
    node: ts.StringLiteralLike,
): boolean {
    if (!isNamespaced(identifier, owner.kind)) {
        return owner.category === "resource-id" && identifier.includes("/") && text === identifier;
    }
    if (owner.category === "bloc-tag") {
        return text === identifier || text.includes(`<${identifier}`) || text.includes(`</${identifier}`);
    }
    if (text !== identifier) {
        return false;
    }
    return semanticContext(node).includes(categoryName(owner.category));
}

function categoryName(category: IntegrationIdentifierCategory): string {
    return category.slice(0, category.indexOf("-"));
}

function isNamespaced(identifier: string, owner: string): boolean {
    return (
        identifier === owner ||
        identifier.startsWith(`${owner}-`) ||
        identifier.startsWith(`${owner}/`) ||
        identifier.startsWith(`urn:${owner}:`)
    );
}

function semanticContext(node: ts.StringLiteralLike): string {
    const parent = node.parent;
    if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        return propertyName(parent.name).toLowerCase();
    }
    return findCallArgument(node)?.expression.getText().toLowerCase() ?? "";
}

function findCallArgument(node: ts.Node): ts.CallExpression | undefined {
    let current = node.parent;
    while (ts.isArrayLiteralExpression(current) || ts.isObjectLiteralExpression(current)) {
        current = current.parent;
    }
    if (!ts.isCallExpression(current)) {
        return undefined;
    }
    return current.arguments.some(
        (argument) =>
            argument === node || (argument.getStart() <= node.getStart() && argument.getEnd() >= node.getEnd()),
    )
        ? current
        : undefined;
}

function propertyName(name: ts.PropertyName): string {
    return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : name.getText();
}

function isTextLiteral(node: ts.Node): node is ts.StringLiteralLike {
    return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node);
}
