import { parse, walk } from "css-tree";
import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../errors";
import { compileBlocStyle } from "./blocStyleCompilation";

type StyleContract = {
    readonly themeVariables: ReadonlySet<string>;
    readonly importedBlocs: ReadonlySet<string>;
};

/** Validate the collection-wide ownership contract of Bloc CSS custom properties. */
export function validateBlocStyles(blocs: readonly CollectionBloc[], contract: StyleContract): void {
    const knownBlocs = [...blocs.map((bloc) => bloc.id), ...contract.importedBlocs].sort(
        (left, right) => right.length - left.length,
    );
    for (const bloc of blocs) {
        if (bloc.kind !== "component" || !bloc.style) {
            continue;
        }
        validateStyle(bloc, bloc.style, knownBlocs, contract.themeVariables);
    }
}

function validateStyle(
    bloc: Extract<CollectionBloc, { kind: "component" }>,
    source: string,
    knownBlocs: string[],
    theme: ReadonlySet<string>,
): void {
    const path = `$.blocs[${bloc.id}].style`;
    try {
        compileBlocStyle(bloc.id, source);
    } catch (error) {
        invalid(error instanceof Error ? error.message : "invalid Bloc CSS", path);
    }
    let ast: ReturnType<typeof parse>;
    try {
        ast = parse(source, { context: "stylesheet" });
    } catch (error) {
        invalid(`invalid CSS: ${error instanceof Error ? error.message : String(error)}`, path);
    }
    const declared = new Set<string>();
    walk(ast, (node) => {
        if (node.type !== "Declaration" || !node.property.startsWith("--")) {
            return;
        }
        const variable = node.property.slice(2);
        assertWritable(variable, bloc, knownBlocs, theme, path);
        declared.add(variable);
    });
    walk(ast, (node) => {
        if (node.type !== "Function" || node.name.toLowerCase() !== "var") {
            return;
        }
        const children = node.children.toArray();
        const reference = children[0];
        if (reference?.type !== "Identifier" || !reference.name.startsWith("--")) {
            invalid("invalid CSS custom property reference", path);
        }
        const variable = reference.name.slice(2);
        const owner = variableOwner(variable, knownBlocs);
        if (theme.has(variable)) {
            return;
        }
        if (owner !== bloc.id && (owner === undefined || !bloc.uses.includes(owner))) {
            invalid(
                `cannot read CSS variable --${variable}; it must belong to this Bloc, a Bloc declared in uses, or the theme`,
                path,
            );
        }
        const hasFallback = children.some((child) => child.type === "Operator" && child.value === ",");
        if (!declared.has(variable) && !hasFallback) {
            invalid(`CSS variable --${variable} is neither declared nor provided with a fallback`, path);
        }
    });
}

function assertWritable(
    variable: string,
    bloc: CollectionBloc,
    knownBlocs: string[],
    theme: ReadonlySet<string>,
    path: string,
): void {
    if (theme.has(variable)) {
        return;
    }
    const owner = variableOwner(variable, knownBlocs);
    if (owner === bloc.id || (owner !== undefined && bloc.uses.includes(owner))) {
        return;
    }
    invalid(
        `CSS variable --${variable} must belong to Bloc ${bloc.id}, a Bloc declared in uses, or a known theme token`,
        path,
    );
}

function variableOwner(variable: string, knownBlocs: string[]): string | undefined {
    return knownBlocs.find((blocId) => variable.startsWith(`${blocId}-`));
}
