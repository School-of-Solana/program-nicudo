import { PublicKey, clusterApiUrl } from '@solana/web3.js';

export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST || clusterApiUrl('devnet');
export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || '');
