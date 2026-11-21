import type { z } from "@bernouy/ulvia-sdk";
import type { listInputSchema, listOutputSchema, templateSchema } from "email-templates/schemas/templates";
import type { TemplateContent } from "email-templates/schemas/content";

export type TemplateView = z.infer<typeof templateSchema>;
export type TemplateRecord = TemplateView & {
    format: "ulvia-email-template/v1";
    publications: TemplateContent[];
    lastMutation: string;
};
export interface TemplateStore {
    view(id: string): Promise<TemplateView | null>;
    publication(
        id: string,
        version: number,
    ): Promise<{ locale: string; archived: boolean; content: TemplateContent } | null>;
    get(id: string): Promise<TemplateRecord | null>;
    create(record: TemplateRecord): Promise<boolean>;
    replace(record: TemplateRecord, expectedRevision: number): Promise<boolean>;
    list(input: z.infer<typeof listInputSchema>): Promise<z.infer<typeof listOutputSchema>>;
}
