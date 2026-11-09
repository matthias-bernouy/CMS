import { randomBytes } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";

/** Write before the infrastructure keys: interrupted first startup never regenerates an existing administrator. */
export async function prepareControlAdministrator(servicesRoot: string): Promise<void> {
    const root = join(servicesRoot, "credentials");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, "control-administrator.json");
    try {
        await writeFile(
            path,
            `${JSON.stringify({ email: "admin@ulvia.local", password: randomBytes(32).toString("base64url") })}\n`,
            { flag: "wx", mode: 0o600 },
        );
    } catch (cause) {
        if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "EEXIST")) {
            throw cause;
        }
        const file = await open(path, "r");
        try {
            const bytes = Buffer.alloc(4097);
            const { bytesRead } = await file.read(bytes);
            const value = parseStrictJson(bytes.subarray(0, bytesRead), 4096, 2);
            if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value) ||
                Object.keys(value).sort().join(",") !== "email,password" ||
                !("email" in value) ||
                typeof value.email !== "string" ||
                !("password" in value) ||
                typeof value.password !== "string" ||
                value.password.length < 12
            ) {
                throw new Error("Initial Control credentials are invalid; operator recovery is required");
            }
        } finally {
            await file.close();
        }
    }
}
