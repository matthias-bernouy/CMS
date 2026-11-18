import { expect, test } from "bun:test";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";
import { SmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import { controlledSmtp } from "./server";
import { smtpControl } from "./client";
import { smtpState, SMTP_MESSAGE_BYTES } from "./state";

const credentials = () => ({
    key: randomBytes(32).toString("base64url"),
    username: "performance",
    password: randomBytes(32).toString("base64url"),
});

test("controlled SMTP receives real authenticated Nodemailer messages and refuses forwarding or foreign control", async () => {
    const secret = credentials();
    const server = await controlledSmtp({ ...secret, hostname: "127.0.0.1", smtpPort: 0, httpPort: 0 });
    const control = smtpControl(server.url, secret.key);
    const config = {
        host: "127.0.0.1",
        port: server.smtpPort,
        secure: false,
        username: secret.username,
        password: secret.password,
        fromEmail: "sender@performance.test",
    };
    const emailer = new SmtpEmailer(config);
    const message = {
        to: { email: "recipient@performance.test" },
        subject: "Controlled SMTP fixture",
        text: ".first line\n" + "x".repeat(65536),
    };
    try {
        await emailer.send(message);
        const received = await control.mailbox(message.to.email);
        expect(received.messages).toHaveLength(1);
        expect(received.messages[0]?.from).toBe(config.fromEmail);
        expect(received.messages[0]?.raw).toContain("Subject: Controlled SMTP fixture");
        expect(received.messages[0]?.raw).toContain("\r\n.first line\r\n");
        expect(received.counts.requests).toBe(1);
        expect(received.counts.requestBytes).toBeGreaterThan(65536);
        expect(received.counts.responseBytes).toBeGreaterThan(100);
        await expect(new SmtpEmailer({ ...config, password: "wrong" }).send(message)).rejects.toThrow();
        await expect(emailer.send({ ...message, to: { email: "outside@example.com" } })).rejects.toThrow();
        expect((await control.counts(message.to.email)).requests).toBe(1);
        await expect(smtpControl(server.url, "wrong").mailbox(message.to.email)).rejects.toThrow(
            "fixture-smtp-control-refused",
        );
        await expect(control.mailbox("outside@example.com")).rejects.toThrow();
        await control.remove(message.to.email);
        expect((await control.mailbox(message.to.email)).messages).toEqual([]);
    } finally {
        await server.close();
    }
});

test("SMTP refuses anonymous senders, releases failed binds and destroys unfinished sessions on close", async () => {
    const secret = credentials();
    const server = await controlledSmtp({ ...secret, hostname: "127.0.0.1", smtpPort: 0, httpPort: 0 });
    const socket = connect({ host: "127.0.0.1", port: server.smtpPort });
    try {
        const response = await new Promise<string>((resolve, reject) => {
            let received = "";
            socket.setTimeout(2000, () => reject(new Error("SMTP test timed out")));
            socket.on("error", reject);
            socket.on("connect", () => socket.write("MAIL FROM:<sender@performance.test>\r\n"));
            socket.on("data", (bytes) => {
                received += bytes.toString();
                if (received.includes("530 ")) {
                    resolve(received);
                }
            });
        });
        expect(response).toContain("530 5.7.0 Authentication required");
        await expect(
            controlledSmtp({ ...secret, hostname: "127.0.0.1", smtpPort: server.smtpPort, httpPort: 0 }),
        ).rejects.toThrow();
        expect((await fetch(`${server.url}/readyz`)).status).toBe(200);
    } finally {
        const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
        await server.close();
        await closed;
        expect(socket.destroyed).toBe(true);
    }
});

test("SMTP retains bounded synthetic mailboxes and refuses overflow without changing accepted counts", () => {
    const state = smtpState();
    const message = { from: "sender@performance.test", to: "recipient@performance.test", raw: "mail" };
    for (let index = 0; index < 4; index++) {
        state.accept(message, 100, 100);
    }
    expect(() => state.accept(message, 100, 100)).toThrow();
    expect(state.read(message.to).counts.requests).toBe(4);
    state.remove(message.to);
    expect(state.read(message.to).counts.requests).toBe(0);
    expect(() => state.accept({ ...message, to: "outside@example.com" }, 100, 100)).toThrow();
    expect(() => state.accept({ ...message, raw: "x".repeat(SMTP_MESSAGE_BYTES + 1) }, 100, 100)).toThrow();
    for (let index = 0; index < 512; index++) {
        state.accept({ ...message, to: `recipient-${index}@performance.test` }, 100, 100);
    }
    expect(() => state.accept(message, 100, 100)).toThrow();
    expect(state.read(message.to).messages).toHaveLength(0);
    const bounded = smtpState();
    const large = { ...message, raw: "x".repeat(SMTP_MESSAGE_BYTES) };
    for (let index = 0; index < 4; index++) {
        bounded.accept(large, SMTP_MESSAGE_BYTES, 100);
    }
    expect(() => bounded.accept({ ...message, to: "overflow@performance.test" }, 100, 100)).toThrow();
    bounded.remove(message.to);
    bounded.accept(message, 100, 100);
    expect(bounded.read(message.to).counts.requests).toBe(1);
});

test("SMTP admits at most sixteen real sockets and closes all admitted sessions during cleanup", async () => {
    const server = await controlledSmtp({ ...credentials(), hostname: "127.0.0.1", smtpPort: 0, httpPort: 0 });
    const sockets = Array.from({ length: 17 }, () => connect({ host: "127.0.0.1", port: server.smtpPort }));
    try {
        const admitted = await Promise.all(
            sockets.map(
                (socket) =>
                    new Promise<boolean>((resolve, reject) => {
                        socket.setTimeout(2000, () => reject(new Error("SMTP connection bound test timed out")));
                        socket.once("data", () => resolve(true));
                        socket.once("error", () => resolve(false));
                        socket.once("close", () => resolve(false));
                    }),
            ),
        );
        expect(admitted.filter(Boolean)).toHaveLength(16);
        expect(admitted.filter((value) => !value)).toHaveLength(1);
    } finally {
        const closed = sockets
            .filter((socket) => !socket.destroyed)
            .map((socket) => new Promise<void>((resolve) => socket.once("close", () => resolve())));
        await server.close();
        await Promise.all(closed);
        expect(sockets.every((socket) => socket.destroyed)).toBe(true);
    }
});
