import type { ResourceDocument } from "resources/interfaces/archive";
import { ResourceArchiveError } from "resources/archive/errors";
import { compileBlocStyle } from "./compile";
import { validateBlocStyles } from "./validate";

/** Recheck decoded compiled scopes; an archive cannot substitute unscoped global CSS. */
export function validateResourceStyles(document: ResourceDocument): void {
    const inputs = document.blocs.map((bloc) => {
        let style: string | undefined;
        if (bloc.styleCSS !== undefined) {
            const prefix = `@layer ulvia.blocks {\n@scope ([cms-bloc="${bloc.id}"]) to (:scope [cms-bloc]) {\n`;
            const suffix = "\n}\n}";
            if (!bloc.styleCSS.startsWith(prefix) || !bloc.styleCSS.endsWith(suffix)) {
                throw new ResourceArchiveError("Bloc CSS must have its exact compiled scope");
            }
            style = bloc.styleCSS.slice(prefix.length, -suffix.length);
            if (compileBlocStyle(bloc.id, style) !== bloc.styleCSS) {
                throw new ResourceArchiveError("Bloc CSS does not match its compiled scope");
            }
        }
        return { id: bloc.id, kind: bloc.kind, uses: bloc.uses ?? [], style, runtime: { viewJS: bloc.viewJS } };
    });
    validateBlocStyles(inputs, {
        importedBlocs: new Set(),
        themeVariables: new Set(
            document.theme?.sources.flatMap((source) =>
                source.categories.flatMap((category) => category.tokens.map((token) => token.variable)),
            ) ?? [],
        ),
    });
}
