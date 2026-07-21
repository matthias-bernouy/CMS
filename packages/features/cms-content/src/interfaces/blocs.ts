export type TBloc = {
    id: string;
    name: string;
    group: string;
    description: string;
    viewJS: string;
    editorJS: string;
    /**
     * Author-side source folder, base64-encoded per relative path.
     * Optional — `p9r pull` skips blocs without source and reports them.
     * Lets a fresh checkout reconstruct the editable bloc tree in
     * `site/blocs/<tag>/`.
     */
    source?: Record<string, string>;
};
