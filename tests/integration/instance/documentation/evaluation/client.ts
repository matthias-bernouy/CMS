import { resolve } from "node:path";

const [sessionPath, lane, command] = Bun.argv.slice(2);
if (!sessionPath || !lane || !command) {
    throw new Error(
        "Usage: client <session.json> <collection|revision|upload|clarification|observer> <command>; optional JSON input on stdin",
    );
}
const session = (await Bun.file(resolve(sessionPath)).json()) as { url: string; secret: string };
const text = command === "catalogue" || command === "score" || command === "close" ? "" : await Bun.stdin.text();
const input = text.trim() ? JSON.parse(text) : {};
const response = await fetch(session.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ lane, command, input }),
    signal: AbortSignal.timeout(90_000),
});
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) {
    process.exitCode = 1;
}
