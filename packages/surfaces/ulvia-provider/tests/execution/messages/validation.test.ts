import { expect, test } from "bun:test";
import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { registerOfficialFeatures } from "../../../src/capabilities/features";
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
                return {
                    revision: 1,
                    collections: [{ collectionId: "example/demo", release: { examples: [], blocs: [] } }],
                };
            },
        },
    } as never);
    const response = await invokeHttp(await resolvedContract("ulvia/cms.content"), dispatcher, "examples.get", {
        collectionId: "example/demo",
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
    const response = await invokeHttp(await resolvedContract("ulvia/cms.content"), dispatcher, "pages.create", {
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
    await registerOfficialFeatures(
        dispatcher,
        {
            emailer: new ConfiguredSmtpEmailer({
                secrets: new InMemorySecretStore(),
                transportFactory: async () => ({
                    sendMail: async () => {
                        sends++;
                    },
                }),
            }),
        },
        await emailReleases(),
        smtpOptions("default"),
    );
    await expect(
        dispatcher.invoke(
            "ulvia/cms.emailer.smtp",
            "emailer.send",
            { toEmail: "user@example.com", subject: " ", text: "Body" },
            {
                ...context("fr"),
                http: {
                    headers: new Headers({ "accept-language": "fr" }),
                    transportRequest: new Request("https://provider.test/send", { method: "POST" }),
                },
                invocation: { contractId: "ulvia/cms.emailer.smtp", instanceId: "instance-a" },
                idempotencyKey: "send-1",
            },
        ),
    ).rejects.toMatchObject({
        code: "INVALID_INPUT",
        output: { message: "Certaines informations fournies sont invalides." },
    });
    await expect(
        dispatcher.invoke(
            "ulvia/cms.emailer.smtp",
            "smtp.configuration.update",
            {
                enabled: false,
                fromEmail: "",
                fromName: "",
                replyTo: "",
                smtp: { host: "", port: 587, secure: false, username: "", password: " " },
            },
            {
                ...context("fr"),
                http: {
                    headers: new Headers({ "accept-language": "fr" }),
                    transportRequest: new Request("https://provider.test/configuration", { method: "POST" }),
                },
                invocation: { contractId: "ulvia/cms.emailer.smtp", instanceId: "instance-a" },
            },
        ),
    ).rejects.toMatchObject({
        code: "INVALID_INPUT",
        output: { message: "La configuration SMTP contient des informations invalides." },
    });
    expect(sends).toBe(0);
});

import { emailReleases, smtpOptions } from "../../capabilities/email/fixture";
