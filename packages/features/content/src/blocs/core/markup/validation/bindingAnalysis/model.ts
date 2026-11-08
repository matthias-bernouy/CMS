import type { BindingCapability, BindingValueSchema } from "./types";

export type BindingVariable =
    | { readonly kind: "operation"; readonly capability: BindingCapability }
    | { readonly kind: "schema"; readonly schema: BindingValueSchema }
    | { readonly kind: "unknown" };

export type BindingScope = ReadonlyMap<string, BindingVariable>;

export type BindingFacts = {
    readonly data: ReadonlySet<string>;
    readonly outcomeKinds: ReadonlyMap<string, ReadonlySet<string>>;
    readonly errorCodes: ReadonlyMap<string, ReadonlySet<string>>;
    readonly minimumLengths: ReadonlyMap<string, number>;
    readonly maximumLengths: ReadonlyMap<string, number>;
};

export function emptyFacts(): BindingFacts {
    return {
        data: new Set(),
        outcomeKinds: new Map(),
        errorCodes: new Map(),
        minimumLengths: new Map(),
        maximumLengths: new Map(),
    };
}

export function addVariable(scope: BindingScope, name: string, variable: BindingVariable): BindingScope {
    const next = new Map(scope);
    next.set(name, variable);
    return next;
}

export function withFact(facts: BindingFacts, path: string, value: string | number | boolean | null): BindingFacts {
    const data = new Set(facts.data);
    const outcomeKinds = cloneSets(facts.outcomeKinds);
    const errorCodes = cloneSets(facts.errorCodes);
    const minimumLengths = new Map(facts.minimumLengths);
    const maximumLengths = new Map(facts.maximumLengths);
    if (path.endsWith(".hasData") && value === true) {
        data.add(path.slice(0, -".hasData".length));
    } else if (path.endsWith(".outcome.kind") && typeof value === "string") {
        const name = path.slice(0, -".outcome.kind".length);
        outcomeKinds.set(name, new Set([value]));
        if (value === "success") {
            data.add(name);
        }
    } else if (path.endsWith(".outcome.code") && typeof value === "string") {
        errorCodes.set(path.slice(0, -".outcome.code".length), new Set([value]));
    } else if (path.endsWith(".length") && typeof value === "number") {
        minimumLengths.set(path.slice(0, -".length".length), value);
        maximumLengths.set(path.slice(0, -".length".length), value);
    }
    return { data, outcomeKinds, errorCodes, minimumLengths, maximumLengths };
}

export function withMinimumLength(facts: BindingFacts, path: string, minimum: number): BindingFacts {
    const minimumLengths = new Map(facts.minimumLengths);
    minimumLengths.set(path, Math.max(minimumLengths.get(path) ?? 0, minimum));
    return { ...facts, minimumLengths };
}

export function withMaximumLength(facts: BindingFacts, path: string, maximum: number): BindingFacts {
    const maximumLengths = new Map(facts.maximumLengths);
    maximumLengths.set(path, Math.min(maximumLengths.get(path) ?? Number.MAX_SAFE_INTEGER, maximum));
    return { ...facts, maximumLengths };
}

function cloneSets(source: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> {
    return new Map([...source].map(([key, values]) => [key, new Set(values)]));
}
