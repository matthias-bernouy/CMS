import { CompositeAuthentication } from "@bernouy/auth-composite";
import type { Runner } from "@bernouy/core";
import { ControlCms } from "node_modules/@bernouy/cms/dist/src/control/ControlCms";
import type { NewInstanceConfig } from "src/interfaces/NewInstanceConfig";


export default function startNewInstance(runner: Runner, config: NewInstanceConfig) {


    runner.group(config.clientID, (instanceRunner) => {

        const AuthComposite = new CompositeAuthentication(instanceRunner, [
            {
                
            }
        ])

        new ControlCms(
            instanceRunner,
            "",

        );

    })

}