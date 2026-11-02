import type { Connection } from "../scenarios/client";
import type { EvaluationEvent } from "./bridge";

export async function scoreEvaluation(
    connection: Connection,
    cmsUrl: string,
    pageId: string,
    events: EvaluationEvent[],
    expectedUpload = "Uploaded through documented transport.\n",
) {
    const { call } = connection;
    const installed = await call("ulvia.cms.installations", "list-collection-installations");
    const pages = await call("ulvia.cms.content", "pages.list", { query: "Agent guide", limit: 100 });
    const authored = pages.items.find((page: { path: string }) => page.path === "/agent-guide");
    const response = await fetch(`${cmsUrl}/agent-guide`);
    const html = await response.text();
    const draft = await call("ulvia.cms.content", "pages.get", { id: pageId });
    const workspace = await call("ulvia.cms.files", "workspace.get");
    const matchingUploads = workspace.items.filter((item: { name: string }) => item.name === "agent-upload.txt");
    const uploaded = matchingUploads[0];
    let uploadMatches = false;
    if (uploaded) {
        const signed = await call("ulvia.cms.files", "workspace.files.sign", {
            fileId: uploaded.fileId,
            generation: uploaded.generation,
            expiresIn: 60,
        });
        const bytes = new Uint8Array(await (await fetch(signed.url)).arrayBuffer());
        const expected = new TextEncoder().encode(expectedUpload);
        uploadMatches = bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
    }
    const contactPages = await call("ulvia.cms.content", "pages.list", { query: "Contact", limit: 100 });
    const contact = contactPages.items.find((page: { path: string }) => page.path === "/contact-cabinet");
    const contactResponse = await fetch(`${cmsUrl}/contact-cabinet`);
    const contactHtml = await contactResponse.text();
    const lanes = ["collection", "revision", "upload", "clarification"].map((lane) => {
        const trace = events.filter((event) => event.lane === lane);
        return {
            lane,
            commands: trace.length,
            searches: trace.filter((event) => event.capability === "documentation.search").length,
            documents: trace
                .filter((event) => event.capability === "documentation.get")
                .map((event) => event.reference),
            refusals: trace.filter((event) => event.isError).map((event) => event.errorCode),
            browserWidths: trace.filter((event) => event.command === "browse").map((event) => event.width),
        };
    });
    return {
        lanes,
        collection: {
            installed: installed.items.some((item: { collectionId: string }) => item.collectionId === "agent-kit"),
            pageCreated: Boolean(authored),
            published: response.status === 200,
            requestedContent: html.includes("Documentation applied"),
        },
        revision: {
            requestedDescription: draft.description === "Updated description after review",
            preservedColleagueTitle: draft.title === "Colleague revision",
            preservedColleagueHeading: draft.content.includes("Colleague reviewed heading"),
            remainsDraft: draft.visible === false,
        },
        upload: {
            exists: Boolean(uploaded),
            exactBytes: uploadMatches,
            private: uploaded?.visibility === "private",
            matchingFiles: matchingUploads.length,
            uploadSessionsCreated: events.filter(
                (event) => event.lane === "upload" && event.capability === "workspace.upload.create" && !event.isError,
            ).length,
        },
        clarification: {
            created: Boolean(contact),
            published: contactResponse.status === 200,
            suppliedName: contactHtml.includes("Cabinet Horizon"),
            suppliedEmail: contactHtml.includes("contact@cabinet-horizon.invalid"),
            suppliedAddress: contactHtml.includes("12 rue des Exemples"),
            appointmentLink: /href=["'][^"']*\/rendez-vous["']/u.test(contactHtml),
            appointmentTargetStatus: (await fetch(`${cmsUrl}/rendez-vous`)).status,
        },
    };
}
