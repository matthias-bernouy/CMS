import type { CaptureArtifacts, CaptureDocument, CaptureEngine } from "@bernouy/browser-capture";
import type { TPage } from "content/pages/interfaces/pages";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import type { ExampleCaptureInput, PageCaptureInput, CaptureSource } from "./schemas";
export interface CaptureServices {
    run<Value>(work: () => Promise<Value>): Promise<Value>;
    readonly engine: CaptureEngine;
    readonly artifacts: CaptureArtifacts;
}
export interface ContentCaptures extends CaptureServices {
    pageDocument(page: TPage, input: PageCaptureInput, context: ContentCapabilityContext): Promise<CaptureDocument>;
    exampleDocument(
        input: ExampleCaptureInput,
        context: ContentCapabilityContext,
    ): Promise<{
        document: CaptureDocument;
        source: CaptureSource;
        width: number;
        height: number;
    }>;
    revision(): Promise<string>;
}
