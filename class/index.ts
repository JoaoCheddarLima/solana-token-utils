import { burnTransactionData, burnTransactionOptions } from '../types/index';
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
    async getBurnTransactionInfo(signature: string, config: burnTransactionOptions = {}): Promise<burnTransactionData | null> {
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


            const getAccountCurrentBalance = async (account: string, commitment: Commitment): Promise<number> => {
                try {
                    const tokenAccountInfo = await super.getTokenAccountBalance(new PublicKey(account), commitment)

                    return tokenAccountInfo.value.uiAmount
                } catch (err) {
                    return 0
                }
            }

            const getMintCurrentBalance = async (mint: string, commitment: Commitment): Promise<number> => {
                try {
                    const mintInfo = await super.getTokenSupply(new PublicKey(mint), commitment)

                    return mintInfo.value.uiAmount
                } catch (err) {
                    return 0
                }
            }

            if (fetchNewBalance) {
                const [newAccountBalance, newMintBalance] = await Promise.all([getAccountCurrentBalance(account, commitment), getMintCurrentBalance(mint, commitment)])

                return { amount, mint, account, authority, newAccountBalance, newMintBalance }
            } else {
                return { amount, mint, account, authority }
            }

        } catch (e) {
            console.error(e)
            return null
        }
    }
}