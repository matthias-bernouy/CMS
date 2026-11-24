import { initiatorWorkflow } from "./initiator";
import { prepareContactWorkflow } from "./workflow";
import { expect, test } from "bun:test";
import { mcpContainers } from "../containers";
import { connectBrowser } from "../oauth";
import { repositoryApi } from "../repository/client";
import { formsCandidate, selectForms } from "./selection";
import { submitInBrowser } from "./browser";
import { draft, answers } from "../../../../packages/features/forms/tests/fixtures";
import { buildSmtpProgram, startSmtpService } from "../../../performance/harness/services/smtp/container";
import type { SmtpService } from "../../../performance/harness/services/smtp/client";

const integration = process.env.ULVIA_RUN_FORMS_JOURNEY === "1" ? test : test.skip;
integration(
    "optional Forms selection, eleven browser fields, optional Workflow Emailer delivery and cold durable recovery",
    async () => {
        const images = {
            edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE!,
            provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE!,
        };
        expect(Object.values(images).every(Boolean)).toBe(true);
        const program = await buildSmtpProgram();
        let smtp!: SmtpService;
        const f = await mcpContainers(images, undefined, undefined, undefined, undefined, async (cluster) => {
            smtp = await startSmtpService(cluster, images.provider, program);
            return [];
        });
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            connection = await connectBrowser(f.cmsUrl, f.administrator);
            expect(connection.tools.some((tool) => tool._meta["io.ulvia/contract"] === "ulvia/cms.forms")).toBe(false);
            const api = repositoryApi(f.cmsUrl);
            const actor = await api.session(f.administrator.email, f.administrator.password);
            const call = async (path: string, input?: unknown, method = "POST", contract = "ulvia/cms.forms") => {
                const response = await api.request(contract, path, method, input, actor);
                expect(response.status, await response.clone().text()).toBe(200);
                return response.json();
            };
            const inventory = () => call("/list-provider-installations", undefined, "GET", "ulvia/cms.installations");
            const before = await inventory();
            const candidate = await formsCandidate(f.cmsUrl, actor.cookie);
            const invalid = await api.request(
                "ulvia/cms.installations",
                "/select-contract",
                "POST",
                { ...candidate, digest: `sha256:${"0".repeat(64)}` },
                actor,
            );
            expect(invalid.status).toBe(422);
            expect((await inventory()).selections).toEqual(before.selections);
            const selected = await selectForms(f.cmsUrl, actor.cookie);
            expect(selected.selected.some((pin: { contractId: string }) => pin.contractId === "ulvia/cms.forms")).toBe(
                true,
            );
            await connection.refreshTools();
            expect(
                connection.tools.filter((tool) => tool._meta["io.ulvia/contract"] === "ulvia/cms.forms"),
            ).toHaveLength(11);
            const control = await repositoryApi(f.control.origin).session(
                f.control.administrator.email,
                f.control.administrator.password,
            );
            const controlInventory = await (
                await repositoryApi(f.control.origin).request(
                    "ulvia/cms.installations",
                    "/list-provider-installations",
                    "GET",
                    undefined,
                    control,
                )
            ).json();
            expect(
                controlInventory.selections.some((pin: { contractId: string }) => pin.contractId === "ulvia/cms.forms"),
            ).toBe(false);
            const configuration = {
                enabled: true,
                fromEmail: "sender@performance.test",
                fromName: "Forms journey",
                replyTo: "reply@performance.test",
                smtp: smtp.connection,
            };
            const member = await api.signup("member@performance.test", "Member-strong-password-123!");
            const formId = crypto.randomUUID();
            const authoring = {
                ...draft,
                fields: draft.fields.map((field) => (field.id === "textarea" ? { ...field, minLength: 1 } : field)),
            };
            await connection.call("ulvia/cms.forms", "forms.create", { formId, draft: authoring });
            await connection.call("ulvia/cms.forms", "forms.publish", { formId, expectedRevision: 1 });
            await connection.call("ulvia/cms.forms", "forms.set-availability", {
                formId,
                expectedRevision: 2,
                availability: "open",
            });
            await call("/configuration", configuration, "POST", "ulvia/cms.emailer.smtp");
            const verifyWorkflow = await prepareContactWorkflow(call, formId, smtp);
            const receiptId = await submitInBrowser(f, connection, formId);
            const read = () => call("/submissions/get", { receiptId }, "QUERY");
            expect((await read()).answers).toEqual(answers);
            await verifyWorkflow();
            const observeInitiator = await initiatorWorkflow(call, formId);
            const mailbox = await smtp.control.mailbox("workflow@performance.test");
            expect(mailbox.messages).toHaveLength(1);
            expect(mailbox.messages[0]!.raw).toContain(receiptId);
            const publicDefinition = await api.request("ulvia/cms.forms", "/forms/public-definition", "QUERY", {
                formId,
            });
            expect(JSON.stringify(await publicDefinition.json())).not.toContain("workflow@performance.test");
            for (const credentials of [{}, member]) {
                const refused = await api.request(
                    "ulvia/cms.forms",
                    "/submissions/get",
                    "QUERY",
                    { receiptId },
                    credentials,
                );
                expect([401, 403]).toContain(refused.status);
            }
            const foreign = await repositoryApi(f.namedUrl).session(f.administrator.email, f.administrator.password);
            await selectForms(f.namedUrl, foreign.cookie);
            const refused = await api.request("ulvia/cms.forms", "/submissions/get", "QUERY", { receiptId }, foreign);
            expect([401, 403]).toContain(refused.status);
            const foreignId = await repositoryApi(f.namedUrl).request(
                "ulvia/cms.forms",
                "/submissions/get",
                "QUERY",
                { receiptId },
                foreign,
            );
            expect([404, 410]).toContain(foreignId.status);
            const input = { formId, formVersion: 1, attemptId: crypto.randomUUID(), answers };
            const accepted = await api.request("ulvia/cms.forms", "/forms/submit", "POST", input);
            expect(accepted.status, await accepted.clone().text()).toBe(200);
            expect(await (await api.request("ulvia/cms.forms", "/forms/submit", "POST", input)).json()).toEqual(
                await accepted.json(),
            );
            await f.restartProvider(0);
            // No CMS call wakes this instance: background discovery must drain its retained intent.
            await Bun.sleep(12000);
            let retained = await call("/submissions/get", { receiptId: input.attemptId }, "QUERY");
            const anonymousEvent = await observeInitiator(input.attemptId);
            expect(anonymousEvent.initiator.kind).toBe("anonymous");
            expect(retained).not.toHaveProperty("notifications");
            expect(retained.answers).toEqual(answers);
            await verifyWorkflow(2);
            expect((await smtp.control.mailbox("workflow@performance.test")).messages).toHaveLength(2);
            expect((await smtp.control.mailbox("forms@performance.test")).messages).toHaveLength(0);
            expect((await read()).answers).toEqual(answers);
            const authenticatedId = crypto.randomUUID();
            await call("/forms/create", {
                formId: authenticatedId,
                draft: {
                    ...authoring,
                    accessMode: "authenticated",
                },
            });
            await call("/forms/publish", { formId: authenticatedId, expectedRevision: 1 });
            await call(
                "/forms/availability",
                { formId: authenticatedId, expectedRevision: 2, availability: "open" },
                "PUT",
            );
            const authenticatedOrigin = await initiatorWorkflow(call, authenticatedId);
            const authenticatedInput = { ...input, formId: authenticatedId, attemptId: crypto.randomUUID() };
            const submission = await api.request(
                "ulvia/cms.forms",
                "/forms/submit-authenticated",
                "POST",
                authenticatedInput,
                member,
            );
            expect(submission.status, await submission.clone().text()).toBe(200);
            await f.restartProvider(0);
            const userEvent = await authenticatedOrigin(authenticatedInput.attemptId);
            expect(userEvent.initiator.kind).toBe("user");
            expect((await smtp.control.mailbox("workflow@performance.test")).messages).toHaveLength(2);
            const resolution = await call(
                "/initiators/resolve",
                { reference: userEvent.initiator.reference, targetContractId: "ulvia/cms.forms" },
                "QUERY",
                "ulvia/cms.events",
            );
            expect(typeof resolution.subjectId).toBe("string");
            expect(resolution.subjectId).not.toBe(member.accountId);
            const memberResolution = await api.request(
                "ulvia/cms.events",
                "/initiators/resolve",
                "QUERY",
                { reference: userEvent.initiator.reference, targetContractId: "ulvia/cms.forms" },
                member,
            );
            expect(memberResolution.status).toBe(403);
            const foreignResolution = await repositoryApi(f.namedUrl).request(
                "ulvia/cms.events",
                "/initiators/resolve",
                "QUERY",
                { reference: userEvent.initiator.reference, targetContractId: "ulvia/cms.forms" },
                foreign,
            );
            expect(foreignResolution.status).toBe(403);
            const forged = await api.request(
                "ulvia/cms.forms",
                "/forms/submit-authenticated",
                "POST",
                { ...authenticatedInput, attemptId: crypto.randomUUID(), userId: actor.accountId },
                member,
            );
            expect(forged.status).toBe(400);
            const forbiddenCapture = await api.request(
                "ulvia/cms.events",
                "/initiators/capture",
                "POST",
                { contractId: "ulvia/cms.forms", eventType: "submission.created", occurrenceId: "fake" },
                actor,
            );
            expect(forbiddenCapture.status).toBe(403);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`, { cause: error });
        } finally {
            await connection?.browser.close();
            await f.close();
        }
    },
    240000,
);
