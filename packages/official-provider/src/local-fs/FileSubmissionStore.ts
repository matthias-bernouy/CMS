import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OfficialSubmission, OfficialSubmissionStore } from "../core/submissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export class FileSubmissionStore implements OfficialSubmissionStore {
    constructor(private readonly root: string) {}

    async create(input: Pick<OfficialSubmission, "email" | "message">): Promise<OfficialSubmission> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const submission = { id: randomUUID(), email: input.email, message: input.message };
        await writeFile(join(this.root, `${submission.id}.json`), JSON.stringify(submission), {
            flag: "wx",
            mode: 0o600,
        });
        return submission;
    }

    async get(id: string): Promise<OfficialSubmission | null> {
        if (!UUID.test(id)) {
            return null;
        }
        const bytes = await readFile(join(this.root, `${id}.json`), "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (bytes === null) {
            return null;
        }
        const value = JSON.parse(bytes) as OfficialSubmission;
        if (value.id !== id || typeof value.email !== "string" || typeof value.message !== "string") {
            throw new Error("Corrupt provider submission");
        }
        return value;
    }
}
