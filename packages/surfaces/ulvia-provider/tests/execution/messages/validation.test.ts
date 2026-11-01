import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { registerSmtpEmailerCapabilities } from "../../../src/capabilities/emailer";
import { context, invokeHttp, resolvedContract } from "./fixtures";

test("unknown examples return a localized input refusal without reading other collections or writing", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let reads = 0;
    let writes = 0;
    registerContentCapabilities(dispatcher, {
        repo: {
            insertPage: async () => {
                writes++;
            },
        },
        collections: {
            snapshot: async () => {
                reads++;
                return { revision: 1, collections: [{ collectionId: "demo", release: { examples: [], blocs: [] } }] };
            },
        },
    } as never);
    const response = await invokeHttp(await resolvedContract("ulvia.cms.content"), dispatcher, "examples.get", {
        collectionId: "demo",
        exampleId: "missing",
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.json()).toEqual({
        error: { code: "INVALID_INPUT", output: { message: "L’exemple demandé n’existe pas dans cette collection." } },
    });
    expect(reads).toBe(1);
    expect(writes).toBe(0);
});

test("schema rejection explains the invalid field before dispatch, without a write", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let writes = 0;
    registerContentCapabilities(dispatcher, {
        repo: {
            insertPage: async () => {
                writes++;
            },
        },
    } as never);
    const response = await invokeHttp(await resolvedContract("ulvia.cms.content"), dispatcher, "pages.create", {
        path: "/draft",
        title: "x".repeat(71),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.json()).toEqual({
        failure: {
            code: "invalid_input",
            retryable: false,
            output: { message: "Le champ « $.title » ne respecte pas le format ou les limites attendus." },
        },
    });
    expect(writes).toBe(0);
});

test("send validation describes email data while SMTP configuration retains its own explanation", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let sends = 0;
    registerSmtpEmailerCapabilities(dispatcher, {
        emailer: {
            send: async () => {
                sends++;
            },
        },
    } as never);
    await expect(
        dispatcher.invoke(
            "ulvia.cms.emailer.smtp",
            "emailer.send",
            { toEmail: "user@example.com", subject: " ", text: "Body" },
            context("fr"),
        ),
    ).rejects.toMatchObject({
        code: "INVALID_INPUT",
        output: { message: "Certaines informations fournies sont invalides." },
    });
    await expect(
        dispatcher.invoke("ulvia.cms.emailer.smtp", "smtp.configuration.update", {}, context("fr")),
    ).rejects.toMatchObject({
        code: "INVALID_INPUT",
        output: { message: "La configuration SMTP contient des informations invalides." },
    });
    expect(sends).toBe(0);
});
