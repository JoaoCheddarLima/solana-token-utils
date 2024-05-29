import { burnTransactionData, burnTransactionOptions } from '@/types';
import { Commitment, Connection, PublicKey } from '@solana/web3.js';

export default class SolanaTokenUtils extends Connection {
    httpEndpoint: string;
    wsEndpoint: string;
    /**
     * Establish a JSON RPC connection
     *
     * @property {string} httpEndpoint to the fullnode JSON RPC endpoint
     * @property {string} wsEndpoint to the fullnode websocket endpoint
     * @property {Commitment} commitment default commitment level or optional ConnectionConfig configuration object
     */
    constructor({
        httpEndpoint = '' as string,
        wsEndpoint = '' as string,
        commitment = '' as Commitment
    }) {
        super(httpEndpoint, {
            commitment,
            wsEndpoint
        });
        this.httpEndpoint = httpEndpoint;
        this.wsEndpoint = wsEndpoint;
    }

    /**
     * Get the burn transaction details
     *
     * @param {string} signature of the transaction
     * @param {burnTransactionOptions} config optional configuration object
     * @returns {Promise<burnTransactionData | null>} the burn transaction details
     */
    async getBurnTransactionInfo(signature: string, config = {} as burnTransactionOptions): Promise<burnTransactionData | null> {
        const { commitment, fetchNewBalance } = config;

        try {
            /**
             * Get the transaction details, the type is any due to an issue with the solana-web3.js types
             */
            const transaction: any = await this.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0
            })

            if (!transaction) return null

            const burnInfo = transaction.transaction.message.instructions.find(i => {
                if (!i?.parsed) return false

                return i.parsed.type === 'burn'
            })

            if (!burnInfo) return null

            const { amount, mint, account, authority } = burnInfo.parsed.info


            if (fetchNewBalance) {
                try {
                    const tokenAccountInfo = await super.getTokenAccountBalance(new PublicKey(account), commitment)

                    const newBalance = tokenAccountInfo.value

                    return { amount, mint, account, authority, newBalance: newBalance.uiAmount }
                } catch (err) {
                    return { amount, mint, account, authority, newBalance: 0 }
                }
            } else {
                return { amount, mint, account, authority }
            }

        } catch (e) {
            console.error(e)
            return null
        }
    }
}