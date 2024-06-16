import { PublicKey } from '@metaplex-foundation/js';
import SolanaTokenUtils from '..';
import {
    MARKET_STATE_LAYOUT_V3
} from './raydium'
import { Commitment } from '@solana/web3.js';

export async function getMinimalMarketV3(
    connection: SolanaTokenUtils,
    marketId: PublicKey,
    commitment: Commitment
) {
    const marketInfo = await connection.getAccountInfo(marketId, {
        commitment
    });

    return MARKET_STATE_LAYOUT_V3.decode(marketInfo.data)
}