import type { TPage } from "cms-content/pages/interfaces/pages";

export interface ContentDiagnostic {
    readonly code: string;
    readonly severity: "error" | "warning";
    readonly message: string;
    readonly location?: {
        readonly blocId?: string;
        readonly path?: string;
        readonly attribute?: string;
    };
    readonly relatedResources?: readonly string[];
    readonly suggestion?: string;
}

/** Transient write feedback; never part of persisted Page data. */
export interface PageWriteFeedback {
    readonly diagnostics: readonly ContentDiagnostic[];
}

export type PageWriteResult = TPage & Partial<PageWriteFeedback>;
