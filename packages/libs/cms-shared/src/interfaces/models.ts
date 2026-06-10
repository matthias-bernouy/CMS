import type { RolesConfig } from "cms-shared/permissions/permissions";

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
        /**
         * HTML structure every rendered page's content is wrapped in inside
         * `<body>`. `{{CONTENT}}` marks where the page's own content is
         * injected; the surrounding markup — header / nav / footer and the
         * `<cms-binding-core>` activation root — is shared by every page.
         * Consumed by delivery's `renderPage`; editable in settings.
         * Defaults to `DEFAULT_SHELL`.
         */
        shell: string;
    },

    /**
     * Page-level Content-Security-Policy whitelist extras. Origins listed
     * here are merged with the auto-derived data-provider origins in the
     * meta CSP emitted by `delivery/core/html/renderPage`.
     *
     * Use these for resources blocs need to reach that aren't modeled as
     * data providers — third-party analytics, error trackers, font CDNs,
     * embed hosts, etc. Each entry is an origin (`scheme://host[:port]`),
     * normalised on save. The DTO parser accepts a newline-separated
     * textarea payload from the admin form.
     */
    security: {
        /** Extra origins for `connect-src` (fetch / xhr / websocket). */
        connectExtras: string[];
        /** Extra origins for `media-src` (`<video>` / `<audio>`). */
        mediaExtras:   string[];
    },

    /**
     * Authorization roles defined by the manager. `definitions` holds every
     * editable role — the built-in `user` (authenticated default) and `public`
     * (anonymous visitor), plus any custom role — each carrying its permission
     * `grants`. The `admin` super-role is virtual and NOT stored here: it bypasses
     * every check. Consumed by the permissions helpers (`grantsFor` / `can`);
     * enforcement is wired separately (admin guard + gateway proxy). Seeded with
     * the two built-ins via `defaultRoleDefinitions()`.
     */
    roles: RolesConfig

}

/**
 * Default page shell (`editor.shell`). `{{CONTENT}}` is the slot delivery
 * replaces with the page's own content. Wrapping it in `<cms-binding-core>`
 * gives every rendered page the data-binding runtime out of the box.
 */
export const DEFAULT_SHELL = "<cms-binding-core>{{CONTENT}}</cms-binding-core>";

/**
 * Compose a page's body by dropping its `content` into the Shell's `{{CONTENT}}`
 * slot. Falls back to {@link DEFAULT_SHELL} when the configured shell lost the
 * marker (systems predating the field, a bad save). Function replacement so
 * `$&` / `$1` inside user content aren't treated as replacement patterns.
 * Shared by delivery (`renderPage`) and the control editor (`page.get`) so the
 * editor canvas mirrors the published composition byte-for-byte.
 */
export function composeShell(shell: string | undefined, content: string): string {
    const tpl = shell?.includes("{{CONTENT}}") ? shell : DEFAULT_SHELL;
    return tpl.replace("{{CONTENT}}", () => content);
}