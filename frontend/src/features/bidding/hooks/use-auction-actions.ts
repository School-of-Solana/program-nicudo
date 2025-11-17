import { useAuctionProgram } from './use-auction-program';
import { toast } from 'sonner';

export function useAuctionActions() {
  const programData = useAuctionProgram();

  const cancelAuction = async (auction: string, tokenMint: string, ownerTokenAccount: string) => {
    if (!programData?.getProgramInstance) return;
    try {
      const { program, connection, wallet } = await programData.getProgramInstance();
      const { PublicKey } = await import('@solana/web3.js');
      const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const auctionPk = new PublicKey(auction);
      const tokenMintPk = new PublicKey(tokenMint);
      const ownerTokenAccountPk = new PublicKey(ownerTokenAccount);
      const ownerPk = new PublicKey(wallet.address);
      const tx = await program.methods.cancelAuction().accounts({
        auction: auctionPk,
        tokenMint: tokenMintPk,
        ownerTokenAccount: ownerTokenAccountPk,
        owner: ownerPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      }).transaction();
      tx.feePayer = ownerPk;
      // @ts-ignore
      const signed = await window.solana?.signTransaction(tx);
      if (!signed) throw new Error('Transaction signing failed');
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      toast.success('Auction cancelled!');
    } catch (error: any) {
      toast.error(`Cancel failed: ${error.message}`);
    }
  };

  const concludeAuction = async (auction: string, tokenMint: string, ownerTokenAccount: string, winnerTokenAccount: string) => {
    if (!programData?.getProgramInstance) return;
    try {
      const { program, connection, wallet } = await programData.getProgramInstance();
      const { PublicKey } = await import('@solana/web3.js');
      const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const auctionPk = new PublicKey(auction);
      const tokenMintPk = new PublicKey(tokenMint);
      const ownerTokenAccountPk = new PublicKey(ownerTokenAccount);
      const winnerTokenAccountPk = new PublicKey(winnerTokenAccount);
      const ownerPk = new PublicKey(wallet.address);
      const tx = await program.methods.concludeAuction().accounts({
        auction: auctionPk,
        tokenMint: tokenMintPk,
        ownerTokenAccount: ownerTokenAccountPk,
        winnerTokenAccount: winnerTokenAccountPk,
        owner: ownerPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: new PublicKey('11111111111111111111111111111111'),
      }).transaction();
      tx.feePayer = ownerPk;
      // @ts-ignore
      const signed = await window.solana?.signTransaction(tx);
      if (!signed) throw new Error('Transaction signing failed');
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(signature);
      toast.success('Auction concluded!');
    } catch (error: any) {
      toast.error(`Conclude failed: ${error.message}`);
    }
  };

  return { cancelAuction, concludeAuction };
}
