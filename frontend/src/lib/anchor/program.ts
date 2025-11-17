
export const BIDDING_SYSTEM_PROGRAM_ID_STRING = 'Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ';

export async function getBiddingSystemProgram(provider: any) {
  const [{ Program, AnchorProvider }, { default: IDL }, { BIDDING_SYSTEM_PROGRAM_ID }] = await Promise.all([
    import('@coral-xyz/anchor'),
    import('./bidding_system.json'),
    import('./programId')
  ]);
  return new Program(IDL, provider);
}

export async function getAuctionPDA(tokenMint: any): Promise<[any, number]> {
  const [{ PublicKey }, { Buffer }] = await Promise.all([
    import('@solana/web3.js'),
    import('buffer')
  ]);
  const programId = new PublicKey(BIDDING_SYSTEM_PROGRAM_ID_STRING);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('auction'), tokenMint.toBuffer()],
    programId
  );
}
