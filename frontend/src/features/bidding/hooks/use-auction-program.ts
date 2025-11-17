'use client';

import { useMemo } from 'react';
import { useSolana } from '@/components/solana/use-solana';

export function useAuctionProgram() {
  const { account } = useSolana();

  return useMemo(() => {
    if (!account?.address) return null;

    return {
      account,
      getProgramInstance: async () => {
        const { Buffer } = await import('buffer');
        if (typeof window !== 'undefined') {
          window.Buffer = Buffer;
        }
        
        const { Connection, PublicKey } = await import('@solana/web3.js');
        const { AnchorProvider, Program } = await import('@coral-xyz/anchor');
        const IDL = await import('@/lib/anchor/bidding_system.json');
        
        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        
        const wallet = {
          publicKey: new PublicKey(account.address),
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        };
        
        const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
        const program = new Program(IDL as any, provider);
        
        return { program, connection, wallet: account };
      }
    };
  }, [account]);
}

export async function getAuctionPDA(mintPublicKey: any) {
  const { PublicKey } = await import('@solana/web3.js');
  return PublicKey.findProgramAddressSync(
    [Buffer.from('auction'), mintPublicKey.toBuffer()],
    new PublicKey('Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ')
  );
}
