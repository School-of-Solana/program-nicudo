'use client';

import { useState } from 'react';
import { useAuctionProgram, getAuctionPDA } from './use-auction-program';
import { toast } from 'sonner';

export function usePlaceBid() {
  const [loading, setLoading] = useState(false);
  const programData = useAuctionProgram();

  const placeBid = async (tokenMint: string, lamports: number) => {
    if (!programData?.getProgramInstance) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);
    try {
      const { program, connection, wallet } = await programData.getProgramInstance();
      const { PublicKey, SystemProgram } = await import('@solana/web3.js');
      
      const mintPubkey = new PublicKey(tokenMint);
      const [auctionPDA] = await getAuctionPDA(mintPubkey);
      const bidderPubkey = new PublicKey(wallet.address);

      const tx = await program.methods
        .placeBid(lamports)
        .accounts({
          auction: auctionPDA,
          bidder: bidderPubkey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = bidderPubkey;

      // @ts-ignore - window.solana exists with wallet
      const signed = await window.solana?.signTransaction(tx);
      if (!signed) throw new Error('Transaction signing failed');

      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

      toast.success(`Bid placed! ${lamports / 1e9} SOL`);
      return signature;
    } catch (error: any) {
      console.error('Error placing bid:', error);
      toast.error(`Error: ${error.message || 'Failed to place bid'}`);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { placeBid, loading };
}
