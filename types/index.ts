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
    newBalance?: number;
}