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

/** Verification state is independent of the bounded diagnostic report. */
export interface PageLinkAnalysis {
    readonly diagnostics: readonly ContentDiagnostic[];
    readonly hasErrors: boolean;
    /** Whether all static destination Pages fit within the bounded read budget. */
    readonly complete: boolean;
}

/** Transient write feedback; never part of persisted Page data. */
export interface PageWriteFeedback {
    readonly diagnostics: readonly ContentDiagnostic[];
}

export type PageWriteResult = TPage & Partial<PageWriteFeedback>;
