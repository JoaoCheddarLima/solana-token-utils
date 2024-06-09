import { burnTransactionData, burnTransactionOptions, decodedTokenInformation } from '../types/index';
import { JsonMetadata, Metaplex } from '@metaplex-foundation/js'
import { Commitment, Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js';
import { decodePair } from '../utils/decoder';

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

    /**
     * Get the transaction details
     *
     * @param {string} signature of the transaction
     * @returns {Promise<VersionedTransactionResponse | null>} the transaction details or null in case of continuos error retries
     */
    async getTransactionWithRetry(signature: string): Promise<VersionedTransactionResponse | null> {
        const minWait = 100

        const fetchData = async (retries: number) => {
            if (retries == 5) return null;
            retries++

            try {
                const transaction = await this.getTransaction(signature, {
                    commitment: 'confirmed',
                    "maxSupportedTransactionVersion": 0
                })

                if (transaction) return transaction

                throw new Error('Transaction not found')
            } catch (err) {
                await new Promise(resolve => setTimeout(resolve, minWait * retries))
                return fetchData(retries)
            }
        }

        return await fetchData(0)
    }

    /**
     * Get the burn transaction details
     *
     * @param {string} signature signature of the transaction
     * @returns {Promise<JsonMetadata | null>} the burn transaction details
     */
    async getMetadata(mint: string): Promise<JsonMetadata | null> {
        try {
            const metaplex = new Metaplex(this)

            const metadata = (await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mint) })).json

            return metadata
        } catch (err) {
            return null
        }
    }

    /**
     * Get the decomposed token information
     *
     * @param {string} transaction signature of the transaction
     * @returns {Promise<decodedTokenInformation | null>} the decomposed token information
     */
    async getTokenDecomposed(transaction: string): Promise<decodedTokenInformation | null> {
        const nullAddress = "So11111111111111111111111111111111111111112"
        const rentAddress = "SysvarRent111111111111111111111111111111111"
        const tx = await this.getParsedTransaction(transaction, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        })

        if (!tx || !tx.meta) return null

        try {
            // @ts-ignore - This is a hack to get the relevant accounts that we need to decode the transaction
            const raydiumRelatedAccounts: string[] = (tx.transaction.message.instructions.find(i => i.programId.toString() == "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")).accounts.map((e: PublicKey) => e.toString())
            const relevantAccounts = raydiumRelatedAccounts.slice(raydiumRelatedAccounts.indexOf(rentAddress) + 1, raydiumRelatedAccounts.indexOf(nullAddress))

            //note that in this area is a general decode for the message data of the transaction and the types need to be set according to the program
            const slicer = "Program log: initialize2: InitializeInstruction2 "
            const logMessage = tx.meta.logMessages.find(e => e.includes(slicer))
            const jsonStringMessage = logMessage.slice(slicer.length).replaceAll(' ', '"').replaceAll(":", '":').replaceAll(",", '",')
            let { init_pc_amount, open_time, init_coin_amount, nonce } = JSON.parse(jsonStringMessage)

            //needs to add types here because idk what is actually happening ts not working properly for those libs
            for (const account of relevantAccounts) {
                try {
                    //note that the types are any due to issue with the library? or I forgot to add the types on it smh

                    const accountInfo: any = await this.getParsedAccountInfo(new PublicKey(account))
                    const poolState: any = decodePair().decode(accountInfo.value.data)

                    if (poolState.lpReserve !== BigInt(0)) {
                        console.log(poolState)
                        //swap variables in case they came swapped somehow
                        if (poolState.baseMint.toString() == nullAddress) {

                            poolState.baseMint = [poolState.quoteMint, poolState.baseMint]
                            poolState.quoteMint = poolState.baseMint[1]
                            poolState.baseMint = poolState.baseMint[0]

                            poolState.baseVault = [poolState.quoteVault, poolState.baseVault]
                            poolState.quoteVault = poolState.baseVault[1]
                            poolState.baseVault = poolState.baseVault[0]

                            init_pc_amount = [init_pc_amount, init_coin_amount]
                            init_coin_amount = init_pc_amount[0]
                            init_pc_amount = init_pc_amount[1]

                        }

                        return {
                            creator: tx.transaction.message.accountKeys[0].pubkey.toString(),
                            token0: poolState.baseMint.toString(),
                            token1: poolState.quoteMint.toString(),
                            pair: account,
                            quoteVault: poolState.quoteVault.toString(),
                            quoteMint: poolState.baseVault.toString(),
                            lpMint: poolState.lpMint.toString(),
                            liquidity: Number(init_pc_amount / 10 ** 9),
                            initialTokens: Number(init_coin_amount),
                            open_time: Number(open_time)
                        }
                    }
                } catch (err) {

                }
            }
        } catch (err) { }

        return null
    }
}