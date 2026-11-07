import type { z } from "zod";
import type { ThemeSettings } from "cms-content/theme/interfaces/theme";
import type {
    examplesListInputSchema,
    examplesListOutputSchema,
    examplesGetInputSchema,
    examplesGetOutputSchema,
} from "cms-content/application/schemas/examples";
import type {
    localizationTextSaveInputSchema,
    localizationTextSaveOutputSchema,
    localizationTextsGetOutputSchema,
} from "cms-content/application/schemas/localization";
export interface ContentTextSelection {
    readonly locale?: string;
    readonly group?: string;
    readonly search?: string;
    readonly siteLocales?: readonly string[];
}
/** One host-owned immutable view; projection methods do not perform another store read. */
export interface ContentContributionView {
    readonly revision: number;
    readonly fallbackLocale?: string;
    theme(base: ThemeSettings, locale: string): ThemeSettings;
    texts(contributionId: string, selection: ContentTextSelection): z.output<typeof localizationTextsGetOutputSchema>;
}
/** The host owns collection/assets projection and mutation; Content owns its wire contract. */
export interface ContentContributions {
    snapshot(siteId: string): Promise<ContentContributionView>;
    saveText(
        siteId: string,
        input: z.input<typeof localizationTextSaveInputSchema>,
    ): Promise<z.output<typeof localizationTextSaveOutputSchema>>;
    listExamples(input: z.input<typeof examplesListInputSchema>): Promise<z.output<typeof examplesListOutputSchema>>;
    getExample(input: z.input<typeof examplesGetInputSchema>): Promise<z.output<typeof examplesGetOutputSchema>>;
}
