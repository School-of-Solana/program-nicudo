'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useSolana } from '@/components/solana/use-solana';
import { toast } from 'sonner';
import { useAuctions } from './hooks/use-auctions';
import { usePlaceBid } from './hooks/use-place-bid';

export default function BiddingFeature() {
  const { connected } = useSolana();
  const [activeTab, setActiveTab] = useState<'create' | 'bid' | 'auctions'>('auctions');

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">SPL Token Auction System</h1>
      </div>

      {!connected ? (
        <Card className="p-6">
          <p className="text-center text-lg">Please connect your wallet to use the auction system</p>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 border-b">
            <Button
              variant={activeTab === 'auctions' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('auctions')}
            >
              Active Auctions
            </Button>
            <Button
              variant={activeTab === 'create' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('create')}
            >
              Create Auction
            </Button>
            <Button
              variant={activeTab === 'bid' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('bid')}
            >
              My Bids
            </Button>
          </div>

          {activeTab === 'create' && <CreateAuctionForm />}
          {activeTab === 'auctions' && <AuctionsList />}
          {activeTab === 'bid' && <MyBids />}
        </>
      )}
    </div>
  );
}

function CreateAuctionForm() {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [uri, setUri] = useState('');
  const [loading, setLoading] = useState(false);
  const { account, client } = useSolana();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!account?.address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);
    
    try {
      // Import Buffer first
      const { Buffer } = await import('buffer');
      if (typeof window !== 'undefined') {
        window.Buffer = Buffer;
      }
      
      const { Connection, PublicKey, Keypair, SystemProgram } = await import('@solana/web3.js');
      const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } = await import('@solana/spl-token');
      const { AnchorProvider, Program } = await import('@coral-xyz/anchor');
      const IDL = await import('@/lib/anchor/bidding_system.json');
      
      // Create connection
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      
      // Create wallet adapter
      const wallet = {
        publicKey: new PublicKey(account.address),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      };
      
      const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
      const program = new Program(IDL as any, provider);
      
      // Generate mint keypair
      const mint = Keypair.generate();
      
      // Derive PDAs
      const [auctionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('auction'), mint.publicKey.toBuffer()],
        new PublicKey('Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ')
      );
      
      const ownerAddress = new PublicKey(account.address);
      const ownerTokenAccount = await getAssociatedTokenAddress(mint.publicKey, ownerAddress);
      
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.publicKey.toBuffer()],
        METADATA_PROGRAM_ID
      );
      
      // Build transaction
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
          rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
        })
        .signers([mint])
        .transaction();
      
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = ownerAddress;
      
      // Sign with mint keypair
      tx.partialSign(mint);
      
      // Send for wallet signing
      // @ts-ignore - window.solana injected by wallet
      const signed = await window.solana?.signTransaction(tx);
      if (!signed) throw new Error('Transaction signing failed');
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      
      toast.success(`Auction created! Mint: ${mint.publicKey.toString().slice(0, 8)}...`);
      
      // Reset form
      setName('');
      setSymbol('');
      setUri('');
    } catch (error: any) {
      console.error('Error creating auction:', error);
      toast.error(`Error: ${error.message || 'Failed to create auction'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Create New Auction</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Token Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter token name"
            required
          />
        </div>
        <div>
          <Label htmlFor="symbol">Symbol</Label>
          <Input
            id="symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Enter symbol (e.g., NFT)"
            required
          />
        </div>
        <div>
          <Label htmlFor="uri">Metadata URI</Label>
          <Input
            id="uri"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="https://example.com/metadata.json"
            required
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Auction'}
        </Button>
      </form>
    </Card>
  );
}

function AuctionsList() {
  const { auctions, loading, refetch } = useAuctions();
  const { placeBid, loading: bidLoading } = usePlaceBid();
  const { cancelAuction, concludeAuction } = require('./hooks/use-auction-actions').useAuctionActions();
  const { account } = require('@/components/solana/use-solana').useSolana();
  const [selectedAuction, setSelectedAuction] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');

  const handlePlaceBid = async (tokenMint: string) => {
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      toast.error('Please enter a valid bid amount');
      return;
    }

    const lamports = Math.floor(parseFloat(bidAmount) * 1e9);
    await placeBid(tokenMint, lamports);
    setBidAmount('');
    setSelectedAuction(null);
    refetch();
  };


  // Stable hook order: derive token accounts for all auctions outside the map
  const [tokenAccounts, setTokenAccounts] = useState<{ [key: string]: { ownerTokenAccount: string | null; winnerTokenAccount: string | null } }>({});
  useEffect(() => {
    (async () => {
      const newTokenAccounts: Record<string, { ownerTokenAccount: string | null; winnerTokenAccount: string | null }> = {};
      for (const auction of auctions) {
        if (auction.tokenMint && auction.owner) {
          const { PublicKey } = await import('@solana/web3.js');
          const { getAssociatedTokenAddress } = await import('@solana/spl-token');
          const mintPk = new PublicKey(auction.tokenMint);
          const ownerPk = new PublicKey(auction.owner);
          const ownerAta = await getAssociatedTokenAddress(mintPk, ownerPk);
          let winnerAta: string | null = null;
          if (auction.bids.length > 0) {
            const winnerPk = new PublicKey(auction.bids[0].bidder);
            winnerAta = (await getAssociatedTokenAddress(mintPk, winnerPk)).toString();
          }
          newTokenAccounts[auction.address] = {
            ownerTokenAccount: ownerAta.toString(),
            winnerTokenAccount: winnerAta,
          };
        }
      }
      setTokenAccounts(newTokenAccounts);
    })();
  }, [auctions]);

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-center">Loading auctions...</p>
      </Card>
    );
  }

  if (auctions.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Active Auctions</h2>
        <p className="text-gray-600">No active auctions yet. Create one to get started!</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Active Auctions ({auctions.length})</h2>
        <Button onClick={refetch} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {auctions.map((auction) => {
        const topBid = auction.bids.length > 0
          ? auction.bids.reduce((max, bid) =>
              BigInt(bid.lamports) > BigInt(max.lamports) ? bid : max
            )
          : null;

        const isOwner = account?.address === auction.owner;
        const ownerTokenAccount = tokenAccounts[auction.address]?.ownerTokenAccount;
        const winnerTokenAccount = tokenAccounts[auction.address]?.winnerTokenAccount;

        return (
          <Card key={auction.address} className="p-6">
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">Auction</h3>
                  <p className="text-sm text-gray-600">
                    Mint: {auction.tokenMint.slice(0, 8)}...{auction.tokenMint.slice(-8)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Owner: {auction.owner.slice(0, 8)}...{auction.owner.slice(-8)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{auction.bidCount} Bids</p>
                  {topBid && (
                    <p className="text-lg font-bold text-green-600">
                      Top: {(Number(topBid.lamports) / 1e9).toFixed(4)} SOL
                    </p>
                  )}
                </div>
              </div>

              {auction.bids.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Recent Bids:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {auction.bids
                      .sort((a, b) => Number(BigInt(b.lamports) - BigInt(a.lamports)))
                      .slice(0, 5)
                      .map((bid, idx) => (
                        <div key={idx} className="text-sm flex justify-between">
                          <span className="text-gray-600">
                            {bid.bidder.slice(0, 8)}...{bid.bidder.slice(-8)}
                          </span>
                          <span className="font-mono">
                            {(Number(bid.lamports) / 1e9).toFixed(4)} SOL
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {selectedAuction === auction.tokenMint ? (
                <div className="flex gap-2 pt-3 border-t">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount in SOL"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                  />
                  <Button
                    onClick={() => handlePlaceBid(auction.tokenMint)}
                    disabled={bidLoading}
                  >
                    {bidLoading ? 'Placing...' : 'Place Bid'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedAuction(null);
                      setBidAmount('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setSelectedAuction(auction.tokenMint)}
                  className="w-full"
                  variant="outline"
                >
                  Place Bid
                </Button>
              )}

              {isOwner && ownerTokenAccount && (
                <div className="flex gap-2 pt-3">
                  <Button
                    variant="destructive"
                    onClick={() => cancelAuction(auction.address, auction.tokenMint, ownerTokenAccount)}
                  >
                    Cancel Auction
                  </Button>
                  {winnerTokenAccount && (
                    <Button
                      variant="default"
                      onClick={() => concludeAuction(auction.address, auction.tokenMint, ownerTokenAccount, winnerTokenAccount)}
                    >
                      Conclude Auction
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function MyBids() {
  const { auctions, loading } = useAuctions();
  const { account } = useSolana();

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-center">Loading...</p>
      </Card>
    );
  }

  const myBids = auctions.flatMap((auction) =>
    auction.bids
      .filter((bid) => bid.bidder === account?.address)
      .map((bid) => ({
        ...bid,
        auction: auction.address,
        tokenMint: auction.tokenMint,
      }))
  );

  if (myBids.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">My Bids</h2>
        <p className="text-gray-600">You haven't placed any bids yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">My Bids ({myBids.length})</h2>
      <div className="space-y-3">
        {myBids.map((bid, idx) => (
          <div key={idx} className="flex justify-between items-center p-3 border rounded">
            <div>
              <p className="text-sm text-gray-600">
                Mint: {bid.tokenMint.slice(0, 8)}...{bid.tokenMint.slice(-8)}
              </p>
            </div>
            <p className="font-mono font-bold">
              {(Number(bid.lamports) / 1e9).toFixed(4)} SOL
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
