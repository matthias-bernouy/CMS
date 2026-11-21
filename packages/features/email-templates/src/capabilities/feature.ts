import { defineFeature } from "@bernouy/ulvia-sdk";
import { TemplateError } from "email-templates/core/errors";
import { createTemplate } from "./authoring/create";
import { getTemplate } from "./queries/get";
import { listTemplate } from "./queries/list";
import { updateDraftTemplate } from "./authoring/update-draft";
import { publishTemplate } from "./authoring/publish";
import { archiveTemplate } from "./authoring/archive";
import { getVersionTemplate } from "./queries/get-version";
import { previewTemplate } from "./rendering/preview";
import { renderTemplate } from "./rendering/render";
export const emailTemplatesFeature = defineFeature({
    contractId: "ulvia/cms.email-templates",
    version: "1.0.0",
    publisherId: "ulvia",
    name: "Email Templates",
    description: "Manage reusable immutable email publications and render bounded content without delivery.",
    catalogue: { icon: "mail", categories: ["administration", "communication"] },
    documents: new URL("../../docs/", import.meta.url),
    capabilities: [
        createTemplate,
        getTemplate,
        listTemplate,
        updateDraftTemplate,
        publishTemplate,
        archiveTemplate,
        getVersionTemplate,
        previewTemplate,
        renderTemplate,
    ],
    mapError: (cause) => ({
        code: cause instanceof TemplateError ? cause.code : "CORE_UNAVAILABLE",
        output: { message: "The email template request could not be completed." },
    }),
});
export type { EmailTemplateServices } from "./define";
