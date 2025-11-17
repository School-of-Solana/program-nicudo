'use client';

import { useState, useEffect } from 'react';
import { useAuctionProgram } from './use-auction-program';

export interface Auction {
  address: string;
  owner: string;
  tokenMint: string;
  bids: Array<{
    bidder: string;
    lamports: string;
    insertionIndex: number;
  }>;
  bidCount: number;
}

export function useAuctions() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(false);
  const programData = useAuctionProgram();

  const fetchAuctions = async () => {
    if (!programData?.getProgramInstance) return;
    
    setLoading(true);
    try {
      const { program } = await programData.getProgramInstance();
      const { PublicKey } = await import('@solana/web3.js');
      
      const accounts = await (program.account as any).auction.all();
      
      const auctionsList = accounts.map((acc: any) => ({
        address: acc.publicKey.toString(),
        owner: acc.account.owner.toString(),
        tokenMint: acc.account.tokenMint.toString(),
        bids: acc.account.bids
          .filter((bid: any) => bid.bidder.toString() !== PublicKey.default.toString())
          .map((bid: any) => ({
            bidder: bid.bidder.toString(),
            lamports: bid.lamports.toString(),
            insertionIndex: bid.insertionIndex,
          })),
        bidCount: acc.account.bidCount,
      }));
      
      setAuctions(auctionsList);
    } catch (error) {
      console.error('Error fetching auctions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
  }, [programData]);

  return { auctions, loading, refetch: fetchAuctions };
}
