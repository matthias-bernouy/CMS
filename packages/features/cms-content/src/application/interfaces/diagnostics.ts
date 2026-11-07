import type { z } from "zod";
import type { contentDiagnosticSchema } from "cms-content/application/schemas/common";
import type { TPage } from "cms-content/pages/interfaces/pages";

export type ContentDiagnostic = z.output<typeof contentDiagnosticSchema>;

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
