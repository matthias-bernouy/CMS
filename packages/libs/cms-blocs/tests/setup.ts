import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register a happy-dom global document/window for DOM-level tests (the binding
// runtime walks real nodes). Pure tests (e.g. charts) are unaffected.
GlobalRegistrator.register();
