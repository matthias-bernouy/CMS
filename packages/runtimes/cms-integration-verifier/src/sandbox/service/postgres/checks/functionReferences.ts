import type { IntegrationAnswerValue, IntegrationDefinition } from "@bernouy/cms-integrations";
import { checkEvidence, finding } from "../evidence";

type FunctionReference = Readonly<{
    path: string;
    functionName: string;
}>;

export async function provisionFunctionCoverage(definition: IntegrationDefinition) {
    const functionCounts = new Map<string, number>();
    for (const connector of definition.connectors ?? []) {
        for (const fn of connector.functions ?? []) {
            functionCounts.set(fn.name, (functionCounts.get(fn.name) ?? 0) + 1);
        }
    }

    const references = (definition.provisions ?? []).flatMap((provision, index) =>
        functionReferences(provision.configuration, `provisions.${index}.configuration`),
    );
    const subjects = references.map((reference) => ({
        ...reference,
        functionMatches: functionCounts.get(reference.functionName) ?? 0,
    }));
    const findings = subjects.flatMap((subject) => {
        if (subject.functionMatches === 0) {
            return [finding("provision-function-missing", subject.path)];
        }
        return subject.functionMatches === 1 ? [] : [finding("provision-function-ambiguous", subject.path)];
    });
    return await checkEvidence("provision-function-coverage", subjects.toSorted(comparePath), findings);
}

export function connectorFunctionTarget(targetUrl: string): Readonly<{ functionName: string; route: string }> | null {
    const match = /^\{\{connectors\.[^.}]+\.functionsBaseUrl\}\}\/([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/u.exec(targetUrl);
    return match ? { functionName: match[1]!, route: match[2] || "/" } : null;
}

function functionReferences(value: IntegrationAnswerValue, path: string): FunctionReference[] {
    if (typeof value === "string") {
        const target = connectorFunctionTarget(value);
        return target ? [{ path, functionName: target.functionName }] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => functionReferences(entry, `${path}.${index}`));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, entry]) => functionReferences(entry, `${path}.${key}`));
    }
    return [];
}

function comparePath(left: Readonly<{ path: string }>, right: Readonly<{ path: string }>): number {
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}
