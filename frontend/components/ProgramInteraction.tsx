'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { getProgram } from '@/utils/anchorClient';
import { PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';

export const ProgramInteraction = () => {
  const { publicKey, wallet } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Auction creation fields
  const [auctionName, setAuctionName] = useState('');
  const [auctionSymbol, setAuctionSymbol] = useState('');
  const [auctionUri, setAuctionUri] = useState('');

  // Bid fields
  const [bidLamports, setBidLamports] = useState('');
  const [auctionAddress, setAuctionAddress] = useState('');

  // Conclude and Cancel fields
  const [concludeAuctionAddress, setConcludeAuctionAddress] = useState('');
  const [cancelAuctionAddress, setCancelAuctionAddress] = useState('');

  // Handlers for each instruction
  const handleCreateAuction = async () => {
    if (!publicKey || !wallet) {
      setStatus('Please connect your wallet');
      return;
    }
    try {
      setLoading(true);
      setStatus('Creating auction...');
      const program = getProgram(wallet.adapter as any);

      // Generate new mint keypair
      const mint = Keypair.generate();

      // Derive metadata account (Metaplex standard)
      const [metadata] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBytes(),
          mint.publicKey.toBytes(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
      );

      // Derive associated token account
      const tokenAccount = await getAssociatedTokenAddress(mint.publicKey, publicKey);

      // Derive auction PDA
      const [auction] = PublicKey.findProgramAddressSync(
        [Buffer.from('auction'), mint.publicKey.toBytes()],
        program.programId
      );

      const tx = await program.methods
        .createAuction(auctionName, auctionSymbol, auctionUri)
        .accounts({
          auction,
          mint: mint.publicKey,
          metadata,
          tokenAccount,
          owner: publicKey,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          metadataProgram: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
          systemProgram: new PublicKey('11111111111111111111111111111111'),
          rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
        })
        .signers([mint])
        .rpc();
      setStatus(`Auction created! Transaction: ${tx}`);
    } catch (error) {
      console.error('Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!publicKey || !wallet) {
      setStatus('Please connect your wallet');
      return;
    }
    try {
      setLoading(true);
      setStatus('Placing bid...');
      const program = getProgram(wallet.adapter as any);
      const lamports = new BN(bidLamports);
      const auction = new PublicKey(auctionAddress);

      const tx = await program.methods
        .placeBid(lamports)
        .accounts({
          auction,
          bidder: publicKey,
        })
        .rpc();
      setStatus(`Bid placed! Transaction: ${tx}`);
    } catch (error) {
      console.error('Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBid = async () => {
    if (!publicKey || !wallet) {
      setStatus('Please connect your wallet');
      return;
    }
    try {
      setLoading(true);
      setStatus('Cancelling bid...');
      const program = getProgram(wallet.adapter as any);
      const auction = new PublicKey(auctionAddress);

      const tx = await program.methods
        .cancelBid()
        .accounts({
          auction,
          bidder: publicKey,
        })
        .rpc();
      setStatus(`Bid cancelled! Transaction: ${tx}`);
    } catch (error) {
      console.error('Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConcludeAuction = async () => {
    if (!publicKey || !wallet) {
      setStatus('Please connect your wallet');
      return;
    }
    try {
      setLoading(true);
      setStatus('Concluding auction...');
      const program = getProgram(wallet.adapter as any);
      const auction = new PublicKey(concludeAuctionAddress);

      // Fetch auction data to get tokenMint and owner
      const auctionData = await (program as any).account.auction.fetch(auction);
      const tokenMint = auctionData.tokenMint;
      const owner = auctionData.owner;

      // Find the winner (highest bid)
      let winner = null;
      let maxBid = 0;
      for (const bid of auctionData.bids) {
        if (bid.lamports > maxBid) {
          maxBid = bid.lamports;
          winner = bid.bidder;
        }
      }
      if (!winner) {
        throw new Error('No bids found in auction');
      }

      // Derive token accounts
      const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner);
      const winnerTokenAccount = await getAssociatedTokenAddress(tokenMint, winner);

      const tx = await program.methods
        .concludeAuction()
        .accounts({
          auction,
          tokenMint,
          ownerTokenAccount,
          winnerTokenAccount,
          owner,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc();
      setStatus(`Auction concluded! Transaction: ${tx}`);
    } catch (error) {
      console.error('Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAuction = async () => {
    if (!publicKey || !wallet) {
      setStatus('Please connect your wallet');
      return;
    }
    try {
      setLoading(true);
      setStatus('Cancelling auction...');
      const program = getProgram(wallet.adapter as any);
      const auction = new PublicKey(cancelAuctionAddress);

      // Fetch auction data to get tokenMint and owner
      const auctionData = await (program as any).account.auction.fetch(auction);
      const tokenMint = auctionData.tokenMint;
      const owner = auctionData.owner;

      // Derive owner token account
      const ownerTokenAccount = await getAssociatedTokenAddress(tokenMint, owner);

      const tx = await program.methods
        .cancelAuction()
        .accounts({
          auction,
          tokenMint,
          ownerTokenAccount,
          owner,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc();
      setStatus(`Auction cancelled! Transaction: ${tx}`);
    } catch (error) {
      console.error('Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Program Interaction</h2>
        {!publicKey ? (
          <p className="text-gray-600">Please connect your wallet to interact with the program</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-gray-600">Connected Wallet:</p>
              <p className="font-mono text-sm">{publicKey.toBase58()}</p>
            </div>

            {/* Create Auction */}
            <div className="space-y-2">
              <h3 className="font-semibold">Create Auction</h3>
              <input
                type="text"
                placeholder="Name"
                value={auctionName}
                onChange={e => setAuctionName(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <input
                type="text"
                placeholder="Symbol"
                value={auctionSymbol}
                onChange={e => setAuctionSymbol(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <input
                type="text"
                placeholder="URI"
                value={auctionUri}
                onChange={e => setAuctionUri(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <button
                onClick={handleCreateAuction}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Create Auction'}
              </button>
            </div>

            {/* Place Bid */}
            <div className="space-y-2">
              <h3 className="font-semibold">Place Bid</h3>
              <input
                type="text"
                placeholder="Auction Address"
                value={auctionAddress}
                onChange={e => setAuctionAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <input
                type="number"
                placeholder="Lamports"
                value={bidLamports}
                onChange={e => setBidLamports(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <button
                onClick={handlePlaceBid}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Place Bid'}
              </button>
            </div>

            {/* Cancel Bid */}
            <div className="space-y-2">
              <h3 className="font-semibold">Cancel Bid</h3>
              <input
                type="text"
                placeholder="Auction Address"
                value={auctionAddress}
                onChange={e => setAuctionAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <button
                onClick={handleCancelBid}
                disabled={loading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Cancel Bid'}
              </button>
            </div>

            {/* Conclude Auction */}
            <div className="space-y-2">
              <h3 className="font-semibold">Conclude Auction</h3>
              <input
                type="text"
                placeholder="Auction Address"
                value={concludeAuctionAddress}
                onChange={e => setConcludeAuctionAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <button
                onClick={handleConcludeAuction}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Conclude Auction'}
              </button>
            </div>

            {/* Cancel Auction */}
            <div className="space-y-2">
              <h3 className="font-semibold">Cancel Auction</h3>
              <input
                type="text"
                placeholder="Auction Address"
                value={cancelAuctionAddress}
                onChange={e => setCancelAuctionAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 mb-1"
              />
              <button
                onClick={handleCancelAuction}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Cancel Auction'}
              </button>
            </div>

            {status && (
              <div className={`p-4 rounded-lg ${
                status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {status}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

