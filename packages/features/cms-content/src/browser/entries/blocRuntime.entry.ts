import { createBlocScope, observeBlocAttributes } from "cms-content/browser/component/Bloc";
import {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
} from "cms-content/browser/component/BlocFormControl";
import { registerBloc } from "cms-content/browser/component/BlocRuntime";

type CmsRuntimeWindow = Window & { cmsRuntime?: Record<string, unknown> };
const runtime = ((window as CmsRuntimeWindow).cmsRuntime ??= {});

Object.assign(runtime, {
    CMS_BLOC_FORM_CONTROL_READY_EVENT,
    connectBlocFormControl,
    createBlocScope,
    observeBlocAttributes,
    registerBloc,
});
