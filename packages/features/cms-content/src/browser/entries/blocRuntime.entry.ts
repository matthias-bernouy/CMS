import { createBlocScope, observeBlocAttributes } from "cms-content/browser/component/Bloc";
import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    requestBlocFormControl,
} from "cms-content/browser/component/BlocFormControl";
import { registerBloc } from "cms-content/browser/component/BlocRuntime";
import { getCmsBrowserRuntime } from "cms-content/browser/runtimeGlobal";
import { CMS_BROWSER_RUNTIME_ABI } from "cms-content/browser/runtimeAbi";

const runtime = getCmsBrowserRuntime(window);

Object.assign(runtime, {
    CMS_BROWSER_RUNTIME_ABI,
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    requestBlocFormControl,
    createBlocScope,
    observeBlocAttributes,
    registerBloc,
});
