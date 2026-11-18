import { SMTP_MESSAGE_BYTES, syntheticMailbox } from "./state";
import type { Socket } from "node:net";
import type { SmtpState } from "./state";

/** Deliberately bounded SMTP subset sufficient for the real Nodemailer transport; never forwards mail. */
export function smtpSession(socket: Socket, state: SmtpState, username: string, password: string) {
    let pending = Buffer.alloc(0);
    let authenticated = false;
    let login: "user" | "password" | undefined;
    let loginUser = "";
    let sender: string | undefined;
    let recipient: string | undefined;
    let data: Buffer[] | undefined;
    let dataBytes = 0;
    let requestBytes = 0;
    let responseBytes = 0;
    let totalReceived = 0;
    let commands = 0;
    const deadline = setTimeout(() => socket.destroy(), 30_000);
    socket.once("close", () => clearTimeout(deadline));
    const reply = (text: string) => {
        responseBytes += Buffer.byteLength(text);
        if (socket.writableLength > 65536) {
            socket.destroy();
            return;
        }
        socket.write(text);
    };
    const reset = () => {
        sender = undefined;
        recipient = undefined;
        data = undefined;
        dataBytes = 0;
    };
    const authenticate = (user: string, secret: string) => {
        authenticated = user === username && secret === password;
        reply(authenticated ? "235 2.7.0 Authenticated\r\n" : "535 5.7.8 Authentication refused\r\n");
        login = undefined;
        loginUser = "";
    };
    const line = (bytes: Buffer) => {
        const text = bytes.toString("utf8");
        if (data) {
            if (text !== ".") {
                dataBytes += bytes.length + 2;
                if (dataBytes > SMTP_MESSAGE_BYTES || data.length >= 65536) {
                    reply("552 5.3.4 Message exceeds fixture bound\r\n");
                    socket.destroy();
                    return;
                }
                data.push(Buffer.concat([text.startsWith(".") ? bytes.subarray(1) : bytes, Buffer.from("\r\n")]));
                return;
            }
            const acknowledgement = "250 2.0.0 Stored\r\n";
            try {
                state.accept(
                    { from: sender!, to: recipient!, raw: Buffer.concat(data).toString("utf8") },
                    requestBytes,
                    responseBytes + Buffer.byteLength(acknowledgement),
                );
                reply(acknowledgement);
            } catch {
                reply("452 4.3.1 Fixture retention limit\r\n");
            }
            reset();
            requestBytes = 0;
            responseBytes = 0;
            return;
        }
        if (bytes.length > 16384 || ++commands > 128) {
            reply("500 5.5.2 Command exceeds fixture bound\r\n");
            socket.destroy();
            return;
        }
        if (login) {
            const decoded = Buffer.from(text, "base64").toString("utf8");
            if (login === "user") {
                loginUser = decoded;
                login = "password";
                reply("334 UGFzc3dvcmQ6\r\n");
            } else {
                authenticate(loginUser, decoded);
            }
            return;
        }
        const command = text.split(" ", 1)[0]!.toUpperCase();
        if (["EHLO", "HELO"].includes(command)) {
            reply(`250-performance.test\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE ${SMTP_MESSAGE_BYTES}\r\n`);
        } else if (command === "AUTH") {
            const [, method, payload] = text.split(" ");
            if (method?.toUpperCase() === "PLAIN" && payload) {
                const [, user, secret] = Buffer.from(payload, "base64").toString("utf8").split("\0");
                authenticate(user ?? "", secret ?? "");
            } else if (method?.toUpperCase() === "LOGIN") {
                login = "user";
                reply("334 VXNlcm5hbWU6\r\n");
            } else {
                reply("504 5.5.4 Unsupported authentication\r\n");
            }
        } else if (command === "QUIT") {
            reply("221 2.0.0 Goodbye\r\n");
            socket.end();
        } else if (command === "RSET") {
            reset();
            reply("250 2.0.0 Reset\r\n");
        } else if (!authenticated) {
            reply("530 5.7.0 Authentication required\r\n");
        } else if (command === "MAIL" || command === "RCPT") {
            const match = /^(?:MAIL FROM|RCPT TO):<([^<>]+)>(?: SIZE=\d+)?$/iu.exec(text);
            try {
                if (!match || (command === "RCPT" && (!sender || recipient))) {
                    throw new Error("Invalid envelope");
                }
                const mailbox = syntheticMailbox(match[1]!);
                if (command === "MAIL") {
                    sender = mailbox;
                    recipient = undefined;
                } else {
                    recipient = mailbox;
                }
                reply("250 2.1.0 Accepted\r\n");
            } catch {
                reply("550 5.1.1 Synthetic envelope required\r\n");
            }
        } else if (command === "DATA" && sender && recipient) {
            data = [];
            reply("354 End with <CRLF>.<CRLF>\r\n");
        } else {
            reply("502 5.5.1 Unsupported command\r\n");
        }
    };
    socket.setTimeout(30_000, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
        requestBytes += chunk.length;
        totalReceived += chunk.length;
        if (totalReceived > SMTP_MESSAGE_BYTES + 65536 || pending.length + chunk.length > SMTP_MESSAGE_BYTES + 32768) {
            socket.destroy();
            return;
        }
        pending = Buffer.concat([pending, chunk]);
        for (let index = pending.indexOf("\r\n"); index >= 0 && !socket.destroyed; index = pending.indexOf("\r\n")) {
            const bytes = pending.subarray(0, index);
            pending = pending.subarray(index + 2);
            line(bytes);
        }
        if (!data && pending.length > 16384) {
            socket.destroy();
        }
    });
    reply("220 performance.test controlled SMTP\r\n");
}
