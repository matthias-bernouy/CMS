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

export type TPage = {
  id: string;
  /** path is unique */
  path: string;
  content: string;
  title: string;
  description: string;
  visible: boolean;
  tags: string[];
}

export type TTemplate = {
    id: string;
    /** Stable slug — primary handle for the CLI / file-system mapping. Immutable. */
    identifier: string;
    name: string;
    description: string;
    content: string;
    category: string;
    createdAt: Date;
}

export type TSnippet = {
    id: string;
    identifier: string;
    name: string;
    description: string;
    content: string;
    category: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string } | null;

export type TSystem = {

    initializationStep: number;

    site: {
        name: string;
        favicon: string;
        visible: boolean;
        /**
         * Canonical base URL of the public site (e.g. `https://example.com`).
         * Used to build the `<link rel="canonical">` of every rendered page.
         * Empty string means "do not emit a canonical link".
         */
        host: string;
        /**
         * Default site language as a BCP-47 tag (e.g. `en`, `fr`, `fr-FR`).
         * Emitted as `<html lang="...">` on every rendered page. Empty string
         * means "do not set a lang attribute".
         */
        language: string;
        /** Raw CSS served at `/style` and linked by every rendered public page. */
        theme: string;
        /** Page rendered when a dynamic route matches but the page is missing. */
        notFound: TPageRef;
        /** Page rendered when `renderPage` throws. */
        serverError: TPageRef;
    },

    editor: {
        /**
         * Name of the template category used as "layouts". When set, opening
         * the editor for a brand-new page auto-opens the BlocLibrary locked
         * on the Templates tab, filtered to this category.
         */
        layoutCategory: string;
    }

}