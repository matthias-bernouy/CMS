import type { CaptureOptions } from "../interfaces/CaptureEngine";
export interface WorkerInput {
    readonly origin: string;
    readonly executablePath: string;
    readonly playwrightModule: string;
    readonly path: string;
    readonly options: CaptureOptions;
    readonly files: readonly { path: string; mediaType: string; base64: string }[];
}
export interface WorkerOutput {
    readonly base64: string;
    readonly width: number;
    readonly height: number;
    readonly browserVersion: string;
    readonly diagnostics: readonly string[];
}
