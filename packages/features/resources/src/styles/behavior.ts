import { blocStyleWrites } from "@bernouy/content/page-document";
import { parse } from "css-tree";
import type { BlocStyleInput } from "resources/interfaces/styles";
import { invalidResource as invalid } from "resources/archive/errors";
import { assertTokenColors, cssReferences } from "./colors";

/** Recheck compiled code: caller-supplied runtime artifacts cannot skip source preparation. */
export function validateColorBehavior(
    blocs: readonly BlocStyleInput[],
    colorInputs: ReadonlySet<string>,
    theme: ReadonlySet<string>,
    knownBlocs: readonly string[],
): void {
    const localBlocs = blocs.map((bloc) => bloc.id);
    for (const bloc of blocs) {
        if (bloc.kind !== "component" || !bloc.runtime?.viewJS) {
            continue;
        }
        const path = `$.blocs[${bloc.id}].runtime.viewJS`;
        const owners = [bloc.id, ...bloc.uses];
        for (const write of blocStyleWrites(bloc.runtime.viewJS)) {
            const name = write.name?.slice(2);
            const owner = knownBlocs.find((id) => name?.startsWith(`${id}-`));
            if (!name || !owner || !owners.includes(owner) || theme.has(name)) {
                invalid(`cannot write CSS variable ${write.name ?? "<dynamic>"}; use an owned Bloc variable`, path);
            }
            const importedInput = !localBlocs.includes(owner);
            if (!colorInputs.has(name) && !importedInput && write.value === undefined) {
                continue;
            }
            if (write.value === undefined) {
                invalid(`--${name} feeds a UI color; select a CSS state or a static theme-token reference`, path);
            }
            let declaration;
            try {
                declaration = parse(`--${name}:${write.value}`, { context: "declaration", parseCustomProperty: true });
            } catch {
                invalid(`invalid color input --${name}; use a static theme-token reference`, path);
            }
            if (declaration.type !== "Declaration") {
                invalid(`invalid color input --${name}`, path);
            }
            assertTokenColors(declaration, path);
            if (!colorInputs.has(name) && !importedInput) {
                continue;
            }
            for (const reference of cssReferences(declaration.value)) {
                if (!theme.has(reference)) {
                    invalid(`--${name} must reference a declared/imported theme token, not --${reference}`, path);
                }
            }
        }
    }
}
