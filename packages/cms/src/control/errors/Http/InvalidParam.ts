

export default class InvalidParam extends Error{

    constructor(name: string, message?: string){
        super("Invalid param " + name + " " + message);
    }

}