import { Program, AnchorProvider, Idl, setProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import idl from '../idl/bidding_system.json';
import { PROGRAM_ID, RPC_ENDPOINT } from './constants';

export const getProgram = (wallet: AnchorWallet) => {
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  setProvider(provider);

  const program = new Program(idl as Idl, provider);
  return program;
};

