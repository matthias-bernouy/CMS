export {
    EDITOR_V2_DELETE_DOCUMENT_EVENT,
    EDITOR_V2_SAVE_DOCUMENT_EVENT,
    ShellController,
} from "./ShellController";
export type {
    EditorFrameUrls,
    EditorPreviewMode,
    EditorV2PageConfig,
    EditorV2SaveDocumentDetail,
} from "./Controller/shellTypes";

import { ShellController } from "./ShellController";

export class Shell extends ShellController {}

if (!customElements.get("cms-editor-shell")) {
    customElements.define("cms-editor-shell", Shell);
}
