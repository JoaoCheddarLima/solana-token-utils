import BN from 'bn.js';

import { LiquidityAssociatedPoolKeysV4 } from '@/swapUtils/raydium';
import { Commitment } from '@solana/web3.js';

export interface burnTransactionOptions {
    commitment?: Commitment;
    fetchNewBalance?: boolean
}

export interface burnTransactionData {
    amount: number;
    mint: string;
    account: string;
    authority: string;
    newAccountBalance?: number;
    newMintBalance?: number;
}

export interface decodedTokenInformation {
    token0: string;
    token1: string;
    quoteVault: string;
    quoteMint: string;
    lpMint: string;
    creator: string;
    pair: string;
    liquidity: number;
    initialTokens: number;
    open_time: number;
    swap: boolean
}
export interface LiquidityPoolInfo extends LiquidityAssociatedPoolKeysV4 {
    status: BN
    baseDecimal: number
    quoteDecimal: number
    lpDecimals: number
    baseReserve: BN
    quoteReserve: BN
    lpSupply: BN
    startTime: BN
}

export interface TransactioNResults {
    error: boolean,
    message: string | null,
    signature: string | null
}

export interface TransactionBody {
    pair: string,
    privateKey: string,
    amountIn: number,
    tipAmount: number
}