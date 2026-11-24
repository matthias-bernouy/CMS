import { expect, test } from "bun:test";
import { mcpContainers } from "../containers";
import { repositoryApi } from "../repository/client";
import { buildSmtpProgram, startSmtpService } from "../../../performance/harness/services/smtp/container";
import type { SmtpService } from "../../../performance/harness/services/smtp/client";
import { capturedMessage, recoveryToken } from "../../../performance/scenarios/email/smtp/message";
import { prepareAccountWorkflows, succeededRuns, deactivate } from "./workflows";
import { checkCausalLoop } from "./loop";
const integration = process.env.ULVIA_RUN_ACCESS_EVENTS_JOURNEY === "1" ? test : test.skip;
integration(
    "Access business events retain security mail, enforce profile privacy and resume official workflows after restart",
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
        try {
            const api = repositoryApi(f.cmsUrl);
            const actor = await api.session(f.administrator.email, f.administrator.password);
            const call = async (path: string, input?: unknown, method = "POST", contract = "ulvia/cms.workflows") => {
                const result = await api.request(contract, path, method, input, actor);
                expect(result.status, await result.clone().text()).toBe(200);
                return result.json();
            };
            await call(
                "/configuration",
                {
                    enabled: true,
                    fromEmail: "sender@performance.test",
                    fromName: "Accounts journey",
                    replyTo: "",
                    smtp: smtp.connection,
                },
                "POST",
                "ulvia/cms.emailer.smtp",
            );
            // Let bootstrap facts drain before explicitly activating the optional team workflow.
            await Bun.sleep(6500);
            await prepareAccountWorkflows(call);
            const email = "account@performance.test",
                password = "Account-strong-password-123!";
            const signup = await api.request("ulvia/cms.access", "/signup", "POST", { email, password });
            expect(signup.status, await signup.clone().text()).toBe(200);
            const mail = await smtp.control.mailbox(email);
            expect(mail.messages).toHaveLength(1);
            const token = recoveryToken(mail.messages[0]!.raw, f.cmsUrl, "/confirm-email");
            await succeededRuns(call, "team", 1);
            const team = await smtp.control.mailbox("team@performance.test");
            expect(team.messages).toHaveLength(1);
            const reference = /Reference ([a-f0-9-]{36})/u.exec(capturedMessage(team.messages[0]!.raw).text)![1]!;
            const profile = await call("/get-event-account", { accountRef: reference }, "QUERY", "ulvia/cms.access");
            expect(profile.email).toBe(email);
            expect(Object.keys(profile).sort()).toEqual(["createdAt", "email"]);
            const foreignApi = repositoryApi(f.namedUrl);
            const foreign = await foreignApi.session(f.administrator.email, f.administrator.password);
            expect(
                (
                    await foreignApi.request(
                        "ulvia/cms.access",
                        "/get-event-account",
                        "QUERY",
                        { accountRef: reference },
                        foreign,
                    )
                ).status,
            ).toBe(404);
            expect([401, 403]).toContain(
                (await api.request("ulvia/cms.access", "/get-event-account", "QUERY", { accountRef: reference }))
                    .status,
            );
            expect(
                (await api.request("ulvia/cms.access", "/login-password", "POST", { email, password })).status,
            ).not.toBe(200);
            expect(
                (await api.request("ulvia/cms.access", "/confirm-email-verification", "POST", { token: "invalid" }))
                    .status,
            ).not.toBe(200);
            expect((await smtp.control.mailbox(email)).messages).toHaveLength(1);
            const confirm = await api.request("ulvia/cms.access", "/confirm-email-verification", "POST", { token });
            expect(confirm.status, await confirm.clone().text()).toBe(200);
            await f.restartProvider(0);
            await succeededRuns(call, "welcome", 1);
            expect((await smtp.control.mailbox(email)).messages).toHaveLength(2);
            expect(
                (await api.request("ulvia/cms.access", "/confirm-email-verification", "POST", { token })).status,
            ).not.toBe(200);
            const member = await api.session(email, password);
            expect(
                (
                    await api.request(
                        "ulvia/cms.access",
                        "/get-event-account",
                        "QUERY",
                        { accountRef: reference },
                        member,
                    )
                ).status,
            ).toBe(403);
            await call("/request-password-reset", { email }, "POST", "ulvia/cms.access");
            const resetMail = await smtp.control.mailbox(email);
            expect(resetMail.messages).toHaveLength(3);
            const reset = recoveryToken(resetMail.messages[2]!.raw, f.cmsUrl, "/reset-password");
            const changed = "Changed-account-password-123!";
            await call("/confirm-password-reset", { token: reset, password: changed }, "POST", "ulvia/cms.access");
            await api.session(email, changed);
            await Bun.sleep(2000);
            await succeededRuns(call, "welcome", 1);
            expect((await smtp.control.mailbox(email)).messages).toHaveLength(3);
            const forged = await api.request(
                "ulvia/cms.events",
                "/events/publish",
                "POST",
                {
                    contractId: "ulvia/cms.access",
                    eventType: "account.created",
                    occurrenceId: crypto.randomUUID(),
                    payloadJson: JSON.stringify({
                        accountRef: reference,
                        provider: "local",
                        createdAt: profile.createdAt,
                    }),
                },
                actor,
            );
            expect(forged.status).toBe(403);
            await deactivate(call, "team");
            await checkCausalLoop(call, api, smtp);
            await deactivate(call, "causal-loop");
            await call(
                "/configuration",
                { enabled: false, fromEmail: "", fromName: "", replyTo: "", smtp: smtp.connection },
                "POST",
                "ulvia/cms.emailer.smtp",
            );
            await api.signup("implicit@performance.test", password);
            await Bun.sleep(6500);
            await succeededRuns(call, "welcome", 1);
            expect((await smtp.control.mailbox("implicit@performance.test")).messages).toHaveLength(0);
            await call("/delete-user", { sub: member.accountId }, "POST", "ulvia/cms.access");
            expect(
                (await api.request("ulvia/cms.access", "/get-event-account", "QUERY", { accountRef: reference }, actor))
                    .status,
            ).toBe(404);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`, { cause: error });
        } finally {
            await f.close();
        }
    },
    240000,
);
