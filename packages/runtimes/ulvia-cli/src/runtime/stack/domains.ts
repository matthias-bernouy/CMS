import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UlviaPaths } from "../paths";

const SCHEMA = "ulvia.instance-domain.v1" as const;

type Reservation = Readonly<{ schema: typeof SCHEMA; instance: string; hostname: string }>;

export async function reserveInstanceDomain(paths: UlviaPaths, instance: string, hostname: string): Promise<boolean> {
    const directory = join(paths.services, "domains");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = reservationPath(directory, hostname);
    const reservation: Reservation = { schema: SCHEMA, instance, hostname };
    try {
        await writeFile(path, `${JSON.stringify(reservation)}\n`, { flag: "wx", mode: 0o600 });
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const existing = await readReservation(path);
        if (existing.instance !== instance || existing.hostname !== hostname) {
            throw new Error(`Instance domain is already used by ${existing.instance}: ${hostname}`);
        }
        return false;
    }
}

export async function releaseInstanceDomain(paths: UlviaPaths, instance: string, hostname: string): Promise<void> {
    const path = reservationPath(join(paths.services, "domains"), hostname);
    const existing = await readReservation(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (existing && (existing.instance !== instance || existing.hostname !== hostname)) {
        throw new Error(`Refusing to release an instance domain owned by ${existing.instance}`);
    }
    if (existing) {
        await rm(path);
    }
}

async function readReservation(path: string): Promise<Reservation> {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<Reservation>;
    if (value.schema !== SCHEMA || typeof value.instance !== "string" || typeof value.hostname !== "string") {
        throw new Error("Ulvia instance domain reservation is invalid");
    }
    return value as Reservation;
}

function reservationPath(directory: string, hostname: string): string {
    const key = createHash("sha256").update(hostname).digest("hex");
    return join(directory, `${key}.json`);
}
