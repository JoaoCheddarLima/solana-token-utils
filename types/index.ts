import { Commitment } from "@solana/web3.js";

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
}