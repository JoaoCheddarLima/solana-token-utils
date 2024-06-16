export class LogUtility {
    signature: string;

    constructor() {
        this.signature = "";
    }

    setSignature(signature: string) {
        this.signature = signature;
    }

    success(message: string) {
        return {
            signature: this.signature,
            message: 'Transaction sucessful',
            error: false
        }
    }

    fail(message: string) {
        return {
            signature: this.signature,
            message: 'Transaction failed',
            error: true
        }
    }

    error() {
        return {
            signature: this.signature,
            message: "Code error",
            error: true
        }
    }
}