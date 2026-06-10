export type TBloc = {
    id: string;
    name: string;
    group: string;
    description: string;
    viewJS: string;
    editorJS: string;
    /**
     * Author-side source folder, base64-encoded per relative path.
     * Optional — legacy blocs uploaded before PR 5 don't carry this and
     * `p9r pull` skips them with a warning. Lets a fresh checkout
     * reconstruct the editable bloc tree in `site/blocs/<tag>/`.
     */
    source?: Record<string, string>;
}
