'use client';

import { useSolana } from '@/components/solana/use-solana';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { useState } from 'react';
import { getAuctionPDA } from '@/lib/anchor/program';
import { toast } from 'sonner';
import IDL from '@/lib/anchor/bidding_system.json';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

export function useCreateAuction() {
  const { client, account } = useSolana();
  const [loading, setLoading] = useState(false);

  const createAuction = async (name: string, symbol: string, uri: string) => {
    if (!account?.address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);
    try {
      // Get RPC endpoint from client
      const rpcEndpoint = 'https://api.devnet.solana.com'; // Default to devnet
      const connection = new Connection(rpcEndpoint);
      
      // Create a wallet adapter for Anchor
      const wallet = {
        publicKey: new PublicKey(account.address),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      };

      const provider = new AnchorProvider(
        connection,
        wallet as any,
        AnchorProvider.defaultOptions()
      );

      const program = new Program(IDL as any, provider);

      const mint = Keypair.generate();
      const [auctionPDA] = getAuctionPDA(mint.publicKey);
      const ownerAddress = new PublicKey(account.address);
      const ownerTokenAccount = await getAssociatedTokenAddress(
        mint.publicKey,
        ownerAddress
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.publicKey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      const tx = await program.methods
        .createAuction(name, symbol, uri)
        .accounts({
          auction: auctionPDA,
          mint: mint.publicKey,
          metadata: metadataPDA,
          tokenAccount: ownerTokenAccount,
          owner: ownerAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: RENT_SYSVAR,
        })
        .signers([mint])
        .rpc();

      toast.success(`Auction created! Transaction: ${tx.slice(0, 8)}...`);
      return { signature: tx, mint: mint.publicKey.toString(), auction: auctionPDA.toString() };
    } catch (error: any) {
      console.error('Error creating auction:', error);
      toast.error(`Failed to create auction: ${error.message}`);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { createAuction, loading };
}
