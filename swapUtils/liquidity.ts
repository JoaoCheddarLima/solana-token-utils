import { Commitment, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    publicKey
} from '@solana/buffer-layout-utils'
import {
    struct
} from '@solana/buffer-layout'

import * as Raydium from './raydium'
import SolanaTokenUtils from '..';
import { LiquidityPoolInfo } from '@/types';

export const RAYDIUM_LIQUIDITY_PROGRAM_ID_V4 = Raydium.MAINNET_PROGRAM_ID.AmmV4
export const OPENBOOK_PROGRAM_ID = Raydium.MAINNET_PROGRAM_ID.OPENBOOK_MARKET;

export const MINIMAL_MARKET_STATE_LAYOUT_V3 = struct([
    publicKey('eventQueue'),
    publicKey('bids'),
    publicKey('asks'),
]);

export function createPoolKeys(
    id: PublicKey,
    accountData: any,
    minimalMarketLayoutV3: any,
) {
    return {
        id,
        baseMint: accountData.baseMint,
        quoteMint: accountData.quoteMint,
        lpMint: accountData.lpMint,
        baseDecimals: Number(accountData.baseDecimal),
        quoteDecimals: Number(accountData.quoteDecimal),
        lpDecimals: 5,
        version: 4,
        programId: RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
        authority: Raydium.Liquidity.getAssociatedAuthority({
            programId: RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
        }).publicKey,
        openOrders: accountData.openOrders,
        targetOrders: accountData.targetOrders,
        baseVault: accountData.baseVault,
        quoteVault: accountData.quoteVault,
        marketVersion: 3,
        marketProgramId: accountData.marketProgramId,
        marketId: accountData.marketId,
        marketAuthority: Raydium.Market.getAssociatedAuthority({
            programId: accountData.marketProgramId,
            marketId: accountData.marketId,
        }).publicKey,
        marketBaseVault: accountData.baseVault,
        marketQuoteVault: accountData.quoteVault,
        marketBids: minimalMarketLayoutV3.bids,
        marketAsks: minimalMarketLayoutV3.asks,
        marketEventQueue: minimalMarketLayoutV3.eventQueue,
        withdrawQueue: accountData.withdrawQueue,
        lpVault: accountData.lpVault,
        lookupTableAccount: PublicKey.default,
    };
}

export async function getTokenAccounts(
    connection: SolanaTokenUtils,
    owner: PublicKey,
    commitment: Commitment,
): Promise<{
    pubkey: PublicKey;
    programId: PublicKey;
    accountInfo: Raydium.SplAccount;
}[]> {
    const tokenResp = await connection.getTokenAccountsByOwner(
        owner,
        {
            programId: TOKEN_PROGRAM_ID,
        },
        commitment,
    );

    const accounts = [];
    for (const { pubkey, account } of tokenResp.value) {
        accounts.push({
            pubkey,
            programId: account.owner,
            accountInfo: Raydium.SPL_ACCOUNT_LAYOUT.decode(account.data),
        });
    }

    return accounts;
}