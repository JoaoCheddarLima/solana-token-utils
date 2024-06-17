import bs58 from 'bs58';

import { CreateTraderAPITipInstruction } from '@/swapUtils/bribe';
import {
  JsonMetadata,
  Metaplex,
} from '@metaplex-foundation/js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';

import {
  createPoolKeys,
  getTokenAccounts,
} from '../swapUtils/liquidity';
import { LogUtility } from '../swapUtils/logUtils';
import { getMinimalMarketV3 } from '../swapUtils/market';
import {
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  Token,
  TokenAmount,
} from '../swapUtils/raydium';
import {
  burnTransactionData,
  burnTransactionOptions,
  decodedTokenInformation,
  TransactionBody,
  TransactioNResults,
} from '../types/index';
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
            let swap = false
            //needs to add types here because idk what is actually happening ts not working properly for those libs
            for (const account of relevantAccounts) {
                try {
                    //note that the types are any due to issue with the library? or I forgot to add the types on it smh

                    const accountInfo: any = await this.getParsedAccountInfo(new PublicKey(account))
                    const poolState: any = decodePair().decode(accountInfo.value.data)

                    if (poolState.lpReserve !== BigInt(0)) {
                        //swap variables in case they came swapped somehow
                        if (poolState.baseMint.toString() == nullAddress) {
                            swap = true
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
                            open_time: Number(open_time),
                            swap
                        }
                    }
                } catch (err) {

                }
            }
        } catch (err) {
            console.error(err)
        }

        return null
    }

    /**
     * Buys a raydium token for the specified wallet
     *
     * @param {TransactionBody} config the transaction configuration
     * @returns {Promise<TransactioNResults>} the transaction results
     */
    async buyRaydiumToken({
        pair,
        privateKey,
        amountIn,
        tipAmount
    }: TransactionBody): Promise<TransactioNResults> {
        const log = new LogUtility()
        try {
            const quoteToken = Token.WSOL
            const quoteAmount = new TokenAmount(quoteToken, amountIn, false)

            const wallet = Keypair.fromSecretKey(bs58.decode(privateKey))

            const lpState = await this.getParsedAccountInfo(new PublicKey(pair))
            //@ts-ignore
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(lpState.value.data)

            if (poolState.baseMint.toString() == "So11111111111111111111111111111111111111112") {
                // @ts-ignore this is a swap
                poolState.baseMint = [poolState.baseMint, poolState.quoteMint]

                poolState.quoteMint = poolState.baseMint[0]
                poolState.baseMint = poolState.baseMint[1]
            }

            const tokenAccounts = await getTokenAccounts(this, wallet.publicKey, this.commitment)
            const existentTokenAccounts = new Map<string, { mint: PublicKey, address: PublicKey }>()
            for (const ta of tokenAccounts) {
                existentTokenAccounts.set(ta.accountInfo.mint.toString(), { mint: ta.accountInfo.mint, address: ta.pubkey })
            }

            const ta = tokenAccounts.find(f => f.accountInfo.mint.toString() == quoteToken.mint.toString())
            const quoteTokenAssociatedAddress = ta.pubkey

            if (!lpState) return null

            const market = await getMinimalMarketV3(this, poolState.marketId, 'confirmed')

            const tokenAccount = {
                address: getAssociatedTokenAddressSync(poolState.baseMint, wallet.publicKey),
                mint: poolState.baseMint,
                market: {
                    bids: market.bids,
                    asks: market.asks,
                    eventQueue: market.eventQueue
                }
            }

            const poolKeys = createPoolKeys(new PublicKey(pair), poolState, market)

            const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
                {
                    //@ts-ignore
                    poolKeys,
                    userKeys: {
                        tokenAccountIn: quoteTokenAssociatedAddress,
                        tokenAccountOut: tokenAccount.address,
                        owner: wallet.publicKey,
                    },
                    amountIn: quoteAmount.raw,
                    minAmountOut: 0,
                },
                poolKeys.version,
            );

            const latestBlockhash = await this.getLatestBlockhash({
                commitment: this.commitment
            })

            const messageV0 = new TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 820000 }),
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
                    CreateTraderAPITipInstruction(wallet.publicKey, tipAmount),
                    createAssociatedTokenAccountIdempotentInstruction(
                        wallet.publicKey,
                        tokenAccount.address,
                        wallet.publicKey,
                        poolState.baseMint,
                    ),
                    ...innerTransaction.instructions,

                ],
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);
            transaction.sign([wallet, ...innerTransaction.signers]);

            const signature = await this.sendRawTransaction(transaction.serialize(), {
                preflightCommitment: this.commitment,
            });

            log.setSignature(signature)

            const confirmation = await this.confirmTransaction({
                signature,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash
            }, this.commitment)

            if (!confirmation.value.err) {
                return log.success("Transaction confirmed")
            } else {
                return log.fail("Transaction failed")
            }
        } catch (err) {
            console.error(err)
            return log.error()
        }
    }

    /**
     * Sells a raydium token for the specified wallet
     *
     * @param {TransactionBody} config the transaction configuration
     * @returns {Promise<TransactioNResults>} the transaction results
     */
    async sellRaydiumToken({
        pair,
        privateKey,
        amountIn,
        tipAmount
    }: TransactionBody): Promise<TransactioNResults> {
        const log = new LogUtility()
        try {
            const pairPub = new PublicKey(pair)
            const poolData = await this.getParsedAccountInfo(pairPub)

            if (!poolData) return log.error()
            //@ts-ignore
            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(poolData.value.data)
            const tokenIn = new Token(TOKEN_PROGRAM_ID, poolState.baseMint, Number(poolState.quoteDecimal))
            const tokenAmountIn = new TokenAmount(tokenIn, amountIn, false)

            if (tokenAmountIn.raw == 0) return log.error()

            const market = await getMinimalMarketV3(this, poolState.marketId, 'confirmed')
            const poolKeys = createPoolKeys(pairPub, poolState, market)

            const wallet = Keypair.fromSecretKey(bs58.decode(privateKey))
            const quoteToken = Token.WSOL

            const tokenAccounts = await getTokenAccounts(this, wallet.publicKey, this.commitment)
            const existentTokenAccounts = new Map<string, { mint: PublicKey, address: PublicKey }>()
            for (const ta of tokenAccounts) {
                existentTokenAccounts.set(ta.accountInfo.mint.toString(), { mint: ta.accountInfo.mint, address: ta.pubkey })
            }

            const ta = tokenAccounts.find(f => f.accountInfo.mint.toString() == quoteToken.mint.toString())
            const quoteTokenAssociatedAddress = ta.pubkey

            const tokenAccount = {
                address: getAssociatedTokenAddressSync(poolState.quoteMint, wallet.publicKey),
                mint: poolState.baseMint,
                market: {
                    bids: market.bids,
                    asks: market.asks,
                    eventQueue: market.eventQueue
                }
            }

            const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
                {
                    //@ts-ignore
                    poolKeys,
                    userKeys: {
                        tokenAccountIn: tokenAccount.address,
                        tokenAccountOut: quoteTokenAssociatedAddress,
                        owner: wallet.publicKey,
                    },
                    amountIn: tokenAmountIn.raw,
                    minAmountOut: 0,
                },
                poolKeys.version,
            );

            const latestBlockhash = await this.getLatestBlockhash({
                commitment: this.commitment
            })

            const messageV0 = new TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 820000 }),
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
                    CreateTraderAPITipInstruction(wallet.publicKey, tipAmount),
                    ...innerTransaction.instructions,
                    // createCloseAccountInstruction(
                    //     tokenAccount.address,
                    //     wallet.publicKey,
                    //     wallet.publicKey
                    // )
                ],
            }).compileToV0Message();

            const transaction = new VersionedTransaction(messageV0);
            transaction.sign([wallet, ...innerTransaction.signers]);

            const signature = await this.sendRawTransaction(transaction.serialize(), {
                preflightCommitment: this.commitment,
            });

            log.setSignature(signature)

            const confirmation = await this.confirmTransaction({
                signature,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash
            }, this.commitment)

            if (!confirmation.value.err) {
                return log.success("Transaction confirmed")
            } else {
                return log.fail("Transaction failed")
            }

        } catch (err) {
            console.error(err)
            return log.error()
        }
    }
}