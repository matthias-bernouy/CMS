import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { documentationProcesses } from "../native";
import { connectBrowser } from "../../oauth";
import { evaluationBridge } from "./bridge";
import type { EvaluationLane } from "./bridge";
import { scoreEvaluation } from "./score";

const root = resolve(Bun.argv[2] ?? "artifacts/documentation-agent");
const secondRound = Bun.argv.includes("--round2");
await mkdir(root, { recursive: true, mode: 0o700 });
const processes = await documentationProcesses();
const connection = await connectBrowser(processes.cmsUrl, processes.administrator, {
    executablePath: process.env.ULVIA_DOCUMENTATION_CHROMIUM,
}).catch(async (error) => {
    await processes.close();
    throw error;
});
const draft = await connection.call("ulvia/cms.content", "pages.create", {
    path: "/agent-concurrent",
    title: "Shared review",
    content: '<h1 cms-bloc="ulvia--mossa--heading" size="lg" text-align="start">Original heading</h1>',
});
if (secondRound) {
    const appointment = await connection.call("ulvia/cms.content", "pages.create", {
        path: "/rendez-vous",
        title: "Prendre rendez-vous",
        content: '<h1 cms-bloc="ulvia--mossa--heading" size="lg" text-align="start">Prendre rendez-vous</h1>',
    });
    await connection.call("ulvia/cms.content", "pages.publish", {
        id: appointment.id,
        expectedRevision: appointment.revision,
        visible: true,
    });
}
const bridge = evaluationBridge(connection, processes.cmsUrl, root, draft.id, { loseCompletionResponse: secondRound });
const secret = randomBytes(32).toString("base64url");
const close = async () => {
    server.stop(true);
    clearTimeout(timer);
    await connection.browser.close();
    await processes.close();
};
const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: 2 * 1024 * 1024,
    async fetch(request) {
        if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
            return new Response(null, { status: 401 });
        }
        try {
            const {
                command,
                lane,
                input = {},
            } = (await request.json()) as { command: string; lane: EvaluationLane; input: Record<string, unknown> };
            if (command === "score") {
                return Response.json(
                    await scoreEvaluation(
                        connection,
                        processes.cmsUrl,
                        draft.id,
                        bridge.events,
                        secondRound ? "Vérifié — 中文 🚀\n" : undefined,
                    ),
                );
            }
            if (command === "close") {
                setTimeout(() => {
                    void close();
                }, 20);
                return Response.json({ closing: true });
            }
            return Response.json(await bridge.execute(lane, command, input));
        } catch (error) {
            return Response.json({ error: String(error) }, { status: 422 });
        }
    },
});
const timer = setTimeout(() => {
    void close();
}, 20 * 60_000);
process.on("SIGTERM", () => {
    void close();
});
await writeFile(join(root, "session.json"), JSON.stringify({ url: server.url.href, secret }), { mode: 0o600 });
console.log(
    JSON.stringify({ ready: true, session: join(root, "session.json"), cmsUrl: processes.cmsUrl, pageId: draft.id }),
);
