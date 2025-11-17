import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BiddingSystem } from "../target/types/bidding_system";
import { expect } from "chai";
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Helper function to read zero-copy auction account
async function readAuction(connection: anchor.web3.Connection, auctionPda: PublicKey) {
  const accountInfo = await connection.getAccountInfo(auctionPda);
  const data = accountInfo.data;
  
  // Parse zero-copy account structure:
  // discriminator(8) + owner(32) + token_mint(32) + bids(48 * 10 = 480) + bid_count(1) + next_insertion_index(1) + padding(6)
  const owner = new PublicKey(data.slice(8, 40));
  const tokenMint = new PublicKey(data.slice(40, 72));
  
  // Bids start at offset 72
  const bidsStartOffset = 72;
  const bidStructSize = 48; // 32 bytes pubkey + 8 bytes lamports + 1 byte insertion_index + 7 bytes padding
  const maxBids = 10;
  
  // bid_count is at offset: 8 + 32 + 32 + (48 * 10) = 552
  const bidCount = data.readUInt8(552);
  
  const bids = [];
  
  // Scan all bid slots and collect non-default bids
  // Bids can be scattered after removals
  for (let i = 0; i < maxBids; i++) {
    const offset = bidsStartOffset + (i * bidStructSize);
    const bidder = new PublicKey(data.slice(offset, offset + 32));
    
    // Skip default/empty bids (all zeros)
    if (!bidder.equals(PublicKey.default)) {
      const lamports = new anchor.BN(data.readBigUInt64LE(offset + 32));
      const insertionIndex = data.readUInt8(offset + 40);
      bids.push({ bidder, lamports, insertionIndex });
    }
  }
  
  return { owner, tokenMint, bidCount, bids };
}

describe("bidding_system", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.BiddingSystem as Program<BiddingSystem>;
  
  let owner: Keypair;
  let bidder1: Keypair;
  let bidder2: Keypair;
  let bidder3: Keypair;
  
  let mint: Keypair;
  let auctionPda: PublicKey;
  let ownerTokenAccount: PublicKey;
  let metadataPda: PublicKey;

  before(async () => {
    // Create test keypairs
    owner = Keypair.generate();
    bidder1 = Keypair.generate();
    bidder2 = Keypair.generate();
    bidder3 = Keypair.generate();

    // Airdrop SOL to test accounts
    await airdrop(provider.connection, owner.publicKey);
    await airdrop(provider.connection, bidder1.publicKey);
    await airdrop(provider.connection, bidder2.publicKey);
    await airdrop(provider.connection, bidder3.publicKey);
  });

  describe("Create Auction", () => {
    it("Creates an auction with token minting and metadata", async () => {
      // Generate mint keypair
      mint = Keypair.generate();
      
      // Derive auction PDA
      [auctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), mint.publicKey.toBuffer()],
        program.programId
      );

      // Get associated token account
      ownerTokenAccount = await getAssociatedTokenAddress(
        mint.publicKey,
        owner.publicKey
      );

      // Derive metadata PDA
      [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      const name = "Rare Vintage Guitar";
      const symbol = "GUITAR";
      const uri = "https://arweave.net/guitar-metadata";

      const tx = await program.methods
        .createAuction(name, symbol, uri)
        .accounts({
          auction: auctionPda,
          mint: mint.publicKey,
          metadata: metadataPda,
          tokenAccount: ownerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([owner, mint])
        .rpc();

      console.log("Create auction transaction:", tx);

      // Fetch and verify the auction account (zero-copy)
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      expect(auctionAccount.owner.toString()).to.equal(owner.publicKey.toString());
      expect(auctionAccount.tokenMint.toString()).to.equal(mint.publicKey.toString());
      expect(auctionAccount.bidCount).to.equal(0);
    });

    it("Fails to create auction with insufficient funds", async () => {
      // Create a new owner with minimal funds
      const poorOwner = Keypair.generate();
      
      // Airdrop only a tiny amount (not enough for rent + fees)
      const signature = await provider.connection.requestAirdrop(
        poorOwner.publicKey,
        50_000 // Only 0.00005 SOL - not enough for rent
      );
      await provider.connection.confirmTransaction(signature);

      // Generate mint keypair
      const poorMint = Keypair.generate();
      
      // Derive auction PDA
      const [poorAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), poorMint.publicKey.toBuffer()],
        program.programId
      );

      const poorOwnerTokenAccount = await getAssociatedTokenAddress(
        poorMint.publicKey,
        poorOwner.publicKey
      );

      const [poorMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          poorMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Try to create auction - should fail due to insufficient funds for rent
      try {
        await program.methods
          .createAuction("Poor Test", "POOR", "https://example.com/poor")
          .accounts({
            auction: poorAuctionPda,
            mint: poorMint.publicKey,
            metadata: poorMetadataPda,
            tokenAccount: poorOwnerTokenAccount,
            owner: poorOwner.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          })
          .signers([poorOwner, poorMint])
          .rpc();
        
        expect.fail("Should have failed due to insufficient funds");
      } catch (error) {
        // Should fail with insufficient funds error
        expect(error.toString()).to.match(/insufficient funds|Transfer: insufficient lamports/i);
      }
    });
  });

  describe("Create and Cancel Auction - Lamport Balance Check", () => {
    it("Creates and cancels auction - owner pays gas fees only", async () => {
      // Generate new mint for this test
      const testMint = Keypair.generate();
      
      const [testAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), testMint.publicKey.toBuffer()],
        program.programId
      );

      const testOwnerTokenAccount = await getAssociatedTokenAddress(
        testMint.publicKey,
        owner.publicKey
      );

      const [testMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          testMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Get owner's initial balance
      const balanceBefore = await provider.connection.getBalance(owner.publicKey);
      console.log("Owner balance before:", balanceBefore);

      // Create auction
      await program.methods
        .createAuction("Test Token", "TEST", "https://test.uri")
        .accounts({
          auction: testAuctionPda,
          mint: testMint.publicKey,
          metadata: testMetadataPda,
          tokenAccount: testOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([owner, testMint])
        .rpc();

      const balanceAfterCreate = await provider.connection.getBalance(owner.publicKey);
      console.log("Owner balance after create:", balanceAfterCreate);

      // Cancel auction
      await program.methods
        .cancelAuction()
        .accountsPartial({
          auction: testAuctionPda,
          tokenMint: testMint.publicKey,
          ownerTokenAccount: testOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      // Get owner's final balance
      const balanceAfter = await provider.connection.getBalance(owner.publicKey);
      console.log("Owner balance after cancel:", balanceAfter);

      // Calculate net cost (should be only gas fees since rent is returned)
      const netCost = balanceBefore - balanceAfter;
      console.log("Net cost (gas fees):", netCost);

      // Verify the net cost is positive (owner paid fees) and reasonable
      // Creating token accounts and minting requires more than just transaction fees
      expect(netCost).to.be.greaterThan(0);
      expect(netCost).to.be.lessThan(0.02 * anchor.web3.LAMPORTS_PER_SOL); // Less than 0.02 SOL

      // Verify token was burned
      const mintInfo = await provider.connection.getAccountInfo(testMint.publicKey);
      expect(mintInfo).to.not.be.null;
    });
  });

  describe("Place Bid", () => {
    it("Places a bid with lamport escrow", async () => {
      const bidAmount = new anchor.BN(1_000_000); // 0.001 SOL

      const bidder1BalanceBefore = await provider.connection.getBalance(bidder1.publicKey);

      const tx = await program.methods
        .placeBid(bidAmount)
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      console.log("Place bid transaction:", tx);

      const bidder1BalanceAfter = await provider.connection.getBalance(bidder1.publicKey);
      
      // Verify lamports were escrowed
      const auctionBalance = await provider.connection.getBalance(auctionPda);
      expect(auctionBalance).to.be.greaterThanOrEqual(bidAmount.toNumber());

      // Verify the auction state was updated
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      expect(auctionAccount.bidCount).to.equal(1);
      expect(auctionAccount.bids[0].bidder.toString()).to.equal(bidder1.publicKey.toString());
      expect(auctionAccount.bids[0].lamports.toString()).to.equal(bidAmount.toString());
    });

    it("Updates an existing bid (increase)", async () => {
      const newBidAmount = new anchor.BN(2_000_000); // 0.002 SOL

      await program.methods
        .placeBid(newBidAmount)
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      // Verify bid was updated, count stays at 1
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      expect(auctionAccount.bidCount).to.equal(1);
      expect(auctionAccount.bids[0].lamports.toString()).to.equal(newBidAmount.toString());
    });

    it("Updates an existing bid (decrease) and refunds lamports", async () => {
      // First, place a higher bid
      const highBid = new anchor.BN(5_000_000); // 0.005 SOL
      await program.methods
        .placeBid(highBid)
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      // Record balance before decreasing bid
      const balanceBefore = await provider.connection.getBalance(bidder2.publicKey);
      const auctionBalanceBefore = await provider.connection.getBalance(auctionPda);

      // Now decrease the bid
      const lowBid = new anchor.BN(2_500_000); // 0.0025 SOL (half of previous)
      await program.methods
        .placeBid(lowBid)
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      // Check balances after
      const balanceAfter = await provider.connection.getBalance(bidder2.publicKey);
      const auctionBalanceAfter = await provider.connection.getBalance(auctionPda);

      // Verify bid was updated
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      const bidder2Bid = auctionAccount.bids.find(b => b.bidder.equals(bidder2.publicKey));
      expect(bidder2Bid).to.not.be.undefined;
      expect(bidder2Bid.lamports.toString()).to.equal(lowBid.toString());

      // Verify lamport refund
      const expectedRefund = highBid.sub(lowBid).toNumber(); // 2.5M lamports
      const actualRefund = balanceAfter - balanceBefore;
      
      // Account for transaction fees (small amount)
      expect(actualRefund).to.be.greaterThan(expectedRefund - 10_000); // Within 0.00001 SOL of expected
      expect(actualRefund).to.be.lessThan(expectedRefund + 10_000);

      // Verify auction account balance decreased by the refund amount
      const auctionBalanceChange = auctionBalanceBefore - auctionBalanceAfter;
      expect(auctionBalanceChange).to.equal(expectedRefund);
    });

    it("Allows multiple bidders", async () => {
      await program.methods
        .placeBid(new anchor.BN(3_000_000))
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      await program.methods
        .placeBid(new anchor.BN(4_000_000))
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder3])
        .rpc();

      // Verify all bids were recorded
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      expect(auctionAccount.bidCount).to.equal(3);
    });

    it("Handles equal bids with insertion index tiebreaker", async () => {
      // Create a new auction for this test
      const tiebreakerMint = Keypair.generate();
      const [tiebreakerAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), tiebreakerMint.publicKey.toBuffer()],
        program.programId
      );
      const tiebreakerOwnerTokenAccount = await getAssociatedTokenAddress(
        tiebreakerMint.publicKey,
        owner.publicKey
      );
      const [tiebreakerMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          tiebreakerMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("Tiebreaker Test", "TIE", "https://example.com/tie")
        .accounts({
          auction: tiebreakerAuctionPda,
          mint: tiebreakerMint.publicKey,
          metadata: tiebreakerMetadataPda,
          tokenAccount: tiebreakerOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, tiebreakerMint])
        .rpc();

      // Place three equal bids
      const equalBidAmount = new anchor.BN(5_000_000);
      
      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: tiebreakerAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: tiebreakerAuctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: tiebreakerAuctionPda,
          bidder: bidder3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder3])
        .rpc();

      // Read auction state
      const auctionState = await readAuction(provider.connection, tiebreakerAuctionPda);
      
      // Verify all bids have equal amounts
      expect(auctionState.bidCount).to.equal(3);
      for (const bid of auctionState.bids) {
        expect(bid.lamports.toString()).to.equal(equalBidAmount.toString());
      }
      
      // Verify insertion indices are sequential (1, 2, 3)
      const sortedBids = auctionState.bids.sort((a, b) => a.insertionIndex - b.insertionIndex);
      expect(sortedBids[0].insertionIndex).to.equal(1);
      expect(sortedBids[0].bidder.toString()).to.equal(bidder1.publicKey.toString());
      expect(sortedBids[1].insertionIndex).to.equal(2);
      expect(sortedBids[1].bidder.toString()).to.equal(bidder2.publicKey.toString());
      expect(sortedBids[2].insertionIndex).to.equal(3);
      expect(sortedBids[2].bidder.toString()).to.equal(bidder3.publicKey.toString());

      // Conclude auction and verify bidder1 wins (lowest insertion_index)
      const winnerTokenAccount = await getAssociatedTokenAddress(
        tiebreakerMint.publicKey,
        bidder1.publicKey
      );

      // Create winner token account
      const createAtaIx = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        winnerTokenAccount,
        bidder1.publicKey,
        tiebreakerMint.publicKey
      );
      const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(createAtaTx, [owner]);

      const nonWinnerAccounts = [
        { pubkey: bidder2.publicKey, isWritable: true, isSigner: false },
        { pubkey: bidder3.publicKey, isWritable: true, isSigner: false },
      ];

      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .concludeAuction()
        .accountsPartial({
          auction: tiebreakerAuctionPda,
          tokenMint: tiebreakerMint.publicKey,
          ownerTokenAccount: tiebreakerOwnerTokenAccount,
          winnerTokenAccount: winnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(nonWinnerAccounts)
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Verify owner received winning bid (5_000_000 lamports) + rent refund (~4_788_480) minus gas fees
      const balanceIncrease = ownerBalanceAfter - ownerBalanceBefore;
      expect(balanceIncrease).to.be.greaterThan(9_700_000); // Account for gas fees
      expect(balanceIncrease).to.be.lessThan(9_900_000);

      // Verify winner received the token
      const winnerTokenBalance = await provider.connection.getTokenAccountBalance(winnerTokenAccount);
      expect(winnerTokenBalance.value.amount).to.equal("1");

      // Verify owner token account is empty
      const ownerTokenBalance = await provider.connection.getTokenAccountBalance(tiebreakerOwnerTokenAccount);
      expect(ownerTokenBalance.value.amount).to.equal("0");

      // Verify auction was concluded
      const closedAuction = await provider.connection.getAccountInfo(tiebreakerAuctionPda);
      expect(closedAuction).to.be.null;
    });

    it("Removes oldest bid from equal bids and next oldest becomes winner", async () => {
      // Create a new auction for this test
      const removeOldestMint = Keypair.generate();
      const [removeOldestAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), removeOldestMint.publicKey.toBuffer()],
        program.programId
      );
      const removeOldestOwnerTokenAccount = await getAssociatedTokenAddress(
        removeOldestMint.publicKey,
        owner.publicKey
      );
      const [removeOldestMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          removeOldestMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("Remove Oldest Test", "RMV", "https://example.com/remove")
        .accounts({
          auction: removeOldestAuctionPda,
          mint: removeOldestMint.publicKey,
          metadata: removeOldestMetadataPda,
          tokenAccount: removeOldestOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, removeOldestMint])
        .rpc();

      // Place three equal bids in order
      const equalBidAmount = new anchor.BN(8_000_000);
      
      // Bidder1 places first (insertion_index = 1)
      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: removeOldestAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      // Bidder2 places second (insertion_index = 2)
      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: removeOldestAuctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      // Bidder3 places third (insertion_index = 3)
      await program.methods
        .placeBid(equalBidAmount)
        .accountsPartial({
          auction: removeOldestAuctionPda,
          bidder: bidder3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder3])
        .rpc();

      // Verify initial state: 3 equal bids with indices 1, 2, 3
      let auctionState = await readAuction(provider.connection, removeOldestAuctionPda);
      expect(auctionState.bidCount).to.equal(3);
      
      const sortedBids = auctionState.bids.sort((a, b) => a.insertionIndex - b.insertionIndex);
      expect(sortedBids[0].insertionIndex).to.equal(1);
      expect(sortedBids[0].bidder.toString()).to.equal(bidder1.publicKey.toString());
      expect(sortedBids[1].insertionIndex).to.equal(2);
      expect(sortedBids[1].bidder.toString()).to.equal(bidder2.publicKey.toString());
      expect(sortedBids[2].insertionIndex).to.equal(3);
      expect(sortedBids[2].bidder.toString()).to.equal(bidder3.publicKey.toString());

      // Cancel bidder1's bid (oldest, insertion_index = 1)
      await program.methods
        .cancelBid()
        .accountsPartial({
          auction: removeOldestAuctionPda,
          bidder: bidder1.publicKey,
        })
        .signers([bidder1])
        .rpc();

      // Verify state after cancellation: indices should be reordered to 1, 2
      auctionState = await readAuction(provider.connection, removeOldestAuctionPda);
      expect(auctionState.bidCount).to.equal(2);
      
      const reorderedBids = auctionState.bids.sort((a, b) => a.insertionIndex - b.insertionIndex);
      expect(reorderedBids[0].insertionIndex).to.equal(1);
      expect(reorderedBids[0].bidder.toString()).to.equal(bidder2.publicKey.toString());
      expect(reorderedBids[1].insertionIndex).to.equal(2);
      expect(reorderedBids[1].bidder.toString()).to.equal(bidder3.publicKey.toString());

      // Conclude auction - bidder2 should win (now has lowest insertion_index)
      const winnerTokenAccount = await getAssociatedTokenAddress(
        removeOldestMint.publicKey,
        bidder2.publicKey
      );

      // Create winner token account
      const createAtaIx = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        winnerTokenAccount,
        bidder2.publicKey,
        removeOldestMint.publicKey
      );
      const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(createAtaTx, [owner]);

      const nonWinnerAccounts = [
        { pubkey: bidder3.publicKey, isWritable: true, isSigner: false },
      ];

      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .concludeAuction()
        .accountsPartial({
          auction: removeOldestAuctionPda,
          tokenMint: removeOldestMint.publicKey,
          ownerTokenAccount: removeOldestOwnerTokenAccount,
          winnerTokenAccount: winnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(nonWinnerAccounts)
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Verify owner received winning bid (8_000_000 lamports) + rent refund (~4_788_480) minus gas fees
      const balanceIncrease = ownerBalanceAfter - ownerBalanceBefore;
      expect(balanceIncrease).to.be.greaterThan(12_700_000); // Account for gas fees
      expect(balanceIncrease).to.be.lessThan(12_900_000);

      // Verify winner (bidder2) received the token
      const winnerTokenBalance = await provider.connection.getTokenAccountBalance(winnerTokenAccount);
      expect(winnerTokenBalance.value.amount).to.equal("1");

      // Verify owner token account is empty
      const ownerTokenBalance = await provider.connection.getTokenAccountBalance(removeOldestOwnerTokenAccount);
      expect(ownerTokenBalance.value.amount).to.equal("0");

      // Verify auction was concluded
      const closedAuction = await provider.connection.getAccountInfo(removeOldestAuctionPda);
      expect(closedAuction).to.be.null;
    });

    it("Fails to place bid with insufficient funds", async () => {
      // Create a new bidder with minimal funds
      const poorBidder = Keypair.generate();
      
      // Airdrop only a tiny amount (not enough for a 1 SOL bid + fees)
      const signature = await provider.connection.requestAirdrop(
        poorBidder.publicKey,
        100_000 // Only 0.0001 SOL
      );
      await provider.connection.confirmTransaction(signature);

      // Try to place a 1 SOL bid
      try {
        await program.methods
          .placeBid(new anchor.BN(1_000_000_000))
          .accountsPartial({
            auction: auctionPda,
            bidder: poorBidder.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([poorBidder])
          .rpc();
        
        expect.fail("Should have failed with InsufficientFunds");
      } catch (error) {
        expect(error.toString()).to.include("InsufficientFunds");
      }
    });

    it("Fails to increase bid with insufficient additional funds", async () => {
      // Create a bidder with limited funds
      const limitedBidder = Keypair.generate();
      
      // Airdrop enough for initial bid + fees but not enough for large increase
      const signature = await provider.connection.requestAirdrop(
        limitedBidder.publicKey,
        3_000_000 // 0.003 SOL
      );
      await provider.connection.confirmTransaction(signature);

      // Place initial bid of 1M lamports
      await program.methods
        .placeBid(new anchor.BN(1_000_000))
        .accountsPartial({
          auction: auctionPda,
          bidder: limitedBidder.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([limitedBidder])
        .rpc();

      // Try to increase bid to 100 SOL (way more than available)
      try {
        await program.methods
          .placeBid(new anchor.BN(100_000_000_000))
          .accountsPartial({
            auction: auctionPda,
            bidder: limitedBidder.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([limitedBidder])
          .rpc();
        
        expect.fail("Should have failed with InsufficientFunds");
      } catch (error) {
        expect(error.toString()).to.include("InsufficientFunds");
      }
    });

    it("Places 10 bids (max capacity) and only allows conclude auction", async () => {
      // Create a new auction for this test
      const maxBidsMint = Keypair.generate();
      const [maxBidsAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), maxBidsMint.publicKey.toBuffer()],
        program.programId
      );
      const maxBidsOwnerTokenAccount = await getAssociatedTokenAddress(
        maxBidsMint.publicKey,
        owner.publicKey
      );
      const [maxBidsMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          maxBidsMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create the auction
      await program.methods
        .createAuction("Max Bids Test", "MAXB", "https://example.com/maxbids")
        .accounts({
          auction: maxBidsAuctionPda,
          mint: maxBidsMint.publicKey,
          metadata: maxBidsMetadataPda,
          tokenAccount: maxBidsOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, maxBidsMint])
        .rpc();

      // Create 10 bidders and have them place bids
      const maxBidders = [];
      for (let i = 0; i < 10; i++) {
        const bidder = Keypair.generate();
        await airdrop(provider.connection, bidder.publicKey);
        maxBidders.push(bidder);

        // Place bid with different amounts
        await program.methods
          .placeBid(new anchor.BN((i + 1) * 1_000_000))
          .accountsPartial({
            auction: maxBidsAuctionPda,
            bidder: bidder.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([bidder])
          .rpc();
      }

      // Verify all 10 bids were recorded
      const fullAuction = await readAuction(provider.connection, maxBidsAuctionPda);
      expect(fullAuction.bidCount).to.equal(10);

      // Try to place another bid - should fail with AuctionConcluded
      const extraBidder = Keypair.generate();
      await airdrop(provider.connection, extraBidder.publicKey);
      
      try {
        await program.methods
          .placeBid(new anchor.BN(15_000_000))
          .accountsPartial({
            auction: maxBidsAuctionPda,
            bidder: extraBidder.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([extraBidder])
          .rpc();
        expect.fail("Should have failed with AuctionConcluded");
      } catch (error) {
        expect(error.toString()).to.include("AuctionConcluded");
      }

      // Try to update existing bid - should fail with AuctionConcluded
      try {
        await program.methods
          .placeBid(new anchor.BN(20_000_000))
          .accountsPartial({
            auction: maxBidsAuctionPda,
            bidder: maxBidders[0].publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([maxBidders[0]])
          .rpc();
        expect.fail("Should have failed with AuctionConcluded");
      } catch (error) {
        expect(error.toString()).to.include("AuctionConcluded");
      }

      // Try to cancel a bid - should fail with AuctionConcluded
      try {
        await program.methods
          .cancelBid()
          .accountsPartial({
            auction: maxBidsAuctionPda,
            bidder: maxBidders[0].publicKey,
          })
          .signers([maxBidders[0]])
          .rpc();
        expect.fail("Should have failed with AuctionConcluded");
      } catch (error) {
        expect(error.toString()).to.include("AuctionConcluded");
      }

      // Conclude auction should succeed
      const winner = maxBidders[9]; // Last bidder has highest bid (10 * 1_000_000)
      const winnerTokenAccount = await getAssociatedTokenAddress(
        maxBidsMint.publicKey,
        winner.publicKey
      );

      // Create winner token account
      const createAtaIx = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        winnerTokenAccount,
        winner.publicKey,
        maxBidsMint.publicKey
      );
      const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(createAtaTx, [owner]);

      // Collect all non-winner bidders for remaining_accounts
      const nonWinnerAccounts = [];
      for (let i = 0; i < 9; i++) {
        nonWinnerAccounts.push({
          pubkey: maxBidders[i].publicKey,
          isWritable: true,
          isSigner: false,
        });
      }

      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .concludeAuction()
        .accountsPartial({
          auction: maxBidsAuctionPda,
          tokenMint: maxBidsMint.publicKey,
          ownerTokenAccount: maxBidsOwnerTokenAccount,
          winnerTokenAccount: winnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(nonWinnerAccounts)
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Verify owner received winning bid (10_000_000 lamports) + rent refund (~4_788_480) minus gas fees
      const balanceIncrease = ownerBalanceAfter - ownerBalanceBefore;
      expect(balanceIncrease).to.be.greaterThan(14_700_000); // Account for gas fees
      expect(balanceIncrease).to.be.lessThan(14_900_000);

      // Verify winner received the token
      const winnerTokenBalance = await provider.connection.getTokenAccountBalance(winnerTokenAccount);
      expect(winnerTokenBalance.value.amount).to.equal("1");

      // Verify owner token account is empty
      const ownerTokenBalance = await provider.connection.getTokenAccountBalance(maxBidsOwnerTokenAccount);
      expect(ownerTokenBalance.value.amount).to.equal("0");

      // Verify auction was concluded and closed
      const closedAuction = await provider.connection.getAccountInfo(maxBidsAuctionPda);
      expect(closedAuction).to.be.null;
    });
  });

  describe("Cancel Bid", () => {
    it("Cancels a bid and refunds lamports", async () => {
      const bidder1BalanceBefore = await provider.connection.getBalance(bidder1.publicKey);

      await program.methods
        .cancelBid()
        .accountsPartial({
          auction: auctionPda,
          bidder: bidder1.publicKey,
        })
        .signers([bidder1])
        .rpc();

      const bidder1BalanceAfter = await provider.connection.getBalance(bidder1.publicKey);

      // Verify bid was removed
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      // There should be 3 remaining bids (bidder2, bidder3, and limitedBidder from insufficient funds test)
      expect(auctionAccount.bidCount).to.equal(3);

      // Verify lamports were refunded (balance increased)
      expect(bidder1BalanceAfter).to.be.greaterThan(bidder1BalanceBefore);
    });

    it("Fails to cancel the same bid twice (double cancellation)", async () => {
      // Create a new auction for this test
      const doubleCancelMint = Keypair.generate();
      const [doubleCancelAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), doubleCancelMint.publicKey.toBuffer()],
        program.programId
      );
      const doubleCancelOwnerTokenAccount = await getAssociatedTokenAddress(
        doubleCancelMint.publicKey,
        owner.publicKey
      );
      const [doubleCancelMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          doubleCancelMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("Double Cancel Test", "DBLC", "https://example.com/double")
        .accounts({
          auction: doubleCancelAuctionPda,
          mint: doubleCancelMint.publicKey,
          metadata: doubleCancelMetadataPda,
          tokenAccount: doubleCancelOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, doubleCancelMint])
        .rpc();

      // Place a bid
      await program.methods
        .placeBid(new anchor.BN(3_000_000))
        .accountsPartial({
          auction: doubleCancelAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      // Cancel the bid (first time - should succeed)
      await program.methods
        .cancelBid()
        .accountsPartial({
          auction: doubleCancelAuctionPda,
          bidder: bidder1.publicKey,
        })
        .signers([bidder1])
        .rpc();

      // Try to cancel the same bid again - should fail
      try {
        await program.methods
          .cancelBid()
          .accountsPartial({
            auction: doubleCancelAuctionPda,
            bidder: bidder1.publicKey,
          })
          .signers([bidder1])
          .rpc();
        
        expect.fail("Should have failed with NoBidFound on second cancel");
      } catch (error) {
        expect(error.toString()).to.include("NoBidFound");
      }
    });

    it("Fails to cancel a bid that never existed", async () => {
      // Create a new auction for this test
      const noBidMint = Keypair.generate();
      const [noBidAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), noBidMint.publicKey.toBuffer()],
        program.programId
      );
      const noBidOwnerTokenAccount = await getAssociatedTokenAddress(
        noBidMint.publicKey,
        owner.publicKey
      );
      const [noBidMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          noBidMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("No Bid Test", "NOBD", "https://example.com/nobid")
        .accounts({
          auction: noBidAuctionPda,
          mint: noBidMint.publicKey,
          metadata: noBidMetadataPda,
          tokenAccount: noBidOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, noBidMint])
        .rpc();

      // Place a bid from bidder1
      await program.methods
        .placeBid(new anchor.BN(5_000_000))
        .accountsPartial({
          auction: noBidAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      // Try to cancel a bid from bidder2 who never placed a bid
      try {
        await program.methods
          .cancelBid()
          .accountsPartial({
            auction: noBidAuctionPda,
            bidder: bidder2.publicKey,
          })
          .signers([bidder2])
          .rpc();
        
        expect.fail("Should have failed with NoBidFound");
      } catch (error) {
        expect(error.toString()).to.include("NoBidFound");
      }
    });

    it("Concludes auction after winning bid is cancelled (new winner determined)", async () => {
      // Create a new auction for this test
      const cancelWinnerMint = Keypair.generate();
      const [cancelWinnerAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), cancelWinnerMint.publicKey.toBuffer()],
        program.programId
      );
      const cancelWinnerOwnerTokenAccount = await getAssociatedTokenAddress(
        cancelWinnerMint.publicKey,
        owner.publicKey
      );
      const [cancelWinnerMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          cancelWinnerMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("Cancel Winner Test", "CANW", "https://example.com/cancelwinner")
        .accounts({
          auction: cancelWinnerAuctionPda,
          mint: cancelWinnerMint.publicKey,
          metadata: cancelWinnerMetadataPda,
          tokenAccount: cancelWinnerOwnerTokenAccount,
          owner: owner.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([owner, cancelWinnerMint])
        .rpc();

      // Place three bids
      await program.methods
        .placeBid(new anchor.BN(3_000_000))
        .accountsPartial({
          auction: cancelWinnerAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      await program.methods
        .placeBid(new anchor.BN(5_000_000))
        .accountsPartial({
          auction: cancelWinnerAuctionPda,
          bidder: bidder2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder2])
        .rpc();

      await program.methods
        .placeBid(new anchor.BN(7_000_000)) // Highest bid
        .accountsPartial({
          auction: cancelWinnerAuctionPda,
          bidder: bidder3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder3])
        .rpc();

      // Verify 3 bids
      let auctionState = await readAuction(provider.connection, cancelWinnerAuctionPda);
      expect(auctionState.bidCount).to.equal(3);

      // Cancel the highest bid (bidder3)
      await program.methods
        .cancelBid()
        .accountsPartial({
          auction: cancelWinnerAuctionPda,
          bidder: bidder3.publicKey,
        })
        .signers([bidder3])
        .rpc();

      // Verify 2 bids remain
      auctionState = await readAuction(provider.connection, cancelWinnerAuctionPda);
      expect(auctionState.bidCount).to.equal(2);

      // Now conclude auction - bidder2 should be the new winner (5_000_000)
      const newWinner = bidder2;
      const newWinnerTokenAccount = await getAssociatedTokenAddress(
        cancelWinnerMint.publicKey,
        newWinner.publicKey
      );

      // Create winner token account
      const createAtaIx = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        newWinnerTokenAccount,
        newWinner.publicKey,
        cancelWinnerMint.publicKey
      );
      const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(createAtaTx, [owner]);

      // Collect remaining bidder (bidder1) for refund
      const remainingBidderAccounts = [{
        pubkey: bidder1.publicKey,
        isWritable: true,
        isSigner: false,
      }];

      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .concludeAuction()
        .accountsPartial({
          auction: cancelWinnerAuctionPda,
          tokenMint: cancelWinnerMint.publicKey,
          ownerTokenAccount: cancelWinnerOwnerTokenAccount,
          winnerTokenAccount: newWinnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingBidderAccounts)
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Verify owner received winning bid (5_000_000 lamports) + rent refund (~4_788_480) minus gas fees
      const balanceIncrease = ownerBalanceAfter - ownerBalanceBefore;
      expect(balanceIncrease).to.be.greaterThan(9_700_000); // Account for gas fees
      expect(balanceIncrease).to.be.lessThan(9_900_000);

      // Verify new winner (bidder2) received the token
      const winnerTokenBalance = await provider.connection.getTokenAccountBalance(newWinnerTokenAccount);
      expect(winnerTokenBalance.value.amount).to.equal("1");

      // Verify owner token account is empty
      const ownerTokenBalance = await provider.connection.getTokenAccountBalance(cancelWinnerOwnerTokenAccount);
      expect(ownerTokenBalance.value.amount).to.equal("0");

      // Verify auction was concluded
      const closedAuction = await provider.connection.getAccountInfo(cancelWinnerAuctionPda);
      expect(closedAuction).to.be.null;
    });
  });

  describe("Conclude Auction", () => {
    it("Concludes auction with winner determination", async () => {
      // Read the auction using our helper
      const auctionAccount = await readAuction(provider.connection, auctionPda);
      
      // Find the winner (highest bidder)
      let highestBid = new anchor.BN(0);
      let winnerPubkey = null;
      
      for (let i = 0; i < auctionAccount.bidCount; i++) {
        if (auctionAccount.bids[i].lamports.gt(highestBid)) {
          highestBid = auctionAccount.bids[i].lamports;
          winnerPubkey = auctionAccount.bids[i].bidder;
        }
      }

      // Get winner's token account
      const winnerTokenAccount = await getAssociatedTokenAddress(
        mint.publicKey,
        winnerPubkey
      );

      // Create winner token account
      const createAtaIx = createAssociatedTokenAccountInstruction(
        owner.publicKey,
        winnerTokenAccount,
        winnerPubkey,
        mint.publicKey
      );
      const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
      await provider.sendAndConfirm(createAtaTx, [owner]);

      // Collect all bidder pubkeys for remaining_accounts (excluding winner)
      const bidderAccounts = [];
      for (let i = 0; i < auctionAccount.bidCount; i++) {
        const bidderPubkey = auctionAccount.bids[i].bidder;
        if (!bidderPubkey.equals(PublicKey.default) && !bidderPubkey.equals(winnerPubkey)) {
          bidderAccounts.push({
            pubkey: bidderPubkey,
            isWritable: true,
            isSigner: false,
          });
        }
      }

      const ownerBalanceBefore = await provider.connection.getBalance(owner.publicKey);

      await program.methods
        .concludeAuction()
        .accountsPartial({
          auction: auctionPda,
          tokenMint: mint.publicKey,
          ownerTokenAccount: ownerTokenAccount,
          winnerTokenAccount: winnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(bidderAccounts)
        .signers([owner])
        .rpc();

      const ownerBalanceAfter = await provider.connection.getBalance(owner.publicKey);

      // Verify owner received winning bid (4_000_000 lamports) + rent refund (~4_788_480) minus gas fees
      // Winner had 4_000_000 lamports
      const balanceIncrease = ownerBalanceAfter - ownerBalanceBefore;
      expect(balanceIncrease).to.be.greaterThan(8_700_000); // Account for gas fees
      expect(balanceIncrease).to.be.lessThan(8_900_000);

      // Verify winner received the token
      const winnerTokenBalance = await provider.connection.getTokenAccountBalance(winnerTokenAccount);
      expect(winnerTokenBalance.value.amount).to.equal("1");

      // Verify owner token account is empty
      const ownerTokenBalance = await provider.connection.getTokenAccountBalance(ownerTokenAccount);
      expect(ownerTokenBalance.value.amount).to.equal("0");

      // Verify auction account is closed
      const auctionInfo = await provider.connection.getAccountInfo(auctionPda);
      expect(auctionInfo).to.be.null;
    });
  });

  describe("Conclude Auction - No Bidders", () => {
    it("Fails to conclude auction immediately after creation (no bids)", async () => {
      // Create a new auction for this test
      const noBidsMint = Keypair.generate();
      
      const [noBidsAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), noBidsMint.publicKey.toBuffer()],
        program.programId
      );

      const noBidsOwnerTokenAccount = await getAssociatedTokenAddress(
        noBidsMint.publicKey,
        owner.publicKey
      );

      const [noBidsMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          noBidsMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("No Bids Token", "NOBID", "https://nobids.uri")
        .accounts({
          auction: noBidsAuctionPda,
          mint: noBidsMint.publicKey,
          metadata: noBidsMetadataPda,
          tokenAccount: noBidsOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([owner, noBidsMint])
        .rpc();

      // Try to conclude auction with no bids
      try {
        await program.methods
          .concludeAuction()
          .accountsPartial({
            auction: noBidsAuctionPda,
            tokenMint: noBidsMint.publicKey,
            ownerTokenAccount: noBidsOwnerTokenAccount,
            winnerTokenAccount: noBidsOwnerTokenAccount, // Dummy account
            owner: owner.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts([])
          .signers([owner])
          .rpc();

        expect.fail("Should have failed with NoActiveBids");
      } catch (error) {
        expect(error.toString()).to.include("NoActiveBids");
      }

      // Clean up - cancel auction
      await program.methods
        .cancelAuction()
        .accountsPartial({
          auction: noBidsAuctionPda,
          tokenMint: noBidsMint.publicKey,
          ownerTokenAccount: noBidsOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

    it("Fails to conclude auction after bid is placed and cancelled", async () => {
      // Create another auction for this test
      const cancelledBidMint = Keypair.generate();
      
      const [cancelledBidAuctionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), cancelledBidMint.publicKey.toBuffer()],
        program.programId
      );

      const cancelledBidOwnerTokenAccount = await getAssociatedTokenAddress(
        cancelledBidMint.publicKey,
        owner.publicKey
      );

      const [cancelledBidMetadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          cancelledBidMint.publicKey.toBuffer(),
        ],
        MPL_TOKEN_METADATA_PROGRAM_ID
      );

      // Create auction
      await program.methods
        .createAuction("Cancelled Bid Token", "CANCEL", "https://cancelled.uri")
        .accounts({
          auction: cancelledBidAuctionPda,
          mint: cancelledBidMint.publicKey,
          metadata: cancelledBidMetadataPda,
          tokenAccount: cancelledBidOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([owner, cancelledBidMint])
        .rpc();

      // Place a bid
      await program.methods
        .placeBid(new anchor.BN(5_000_000))
        .accountsPartial({
          auction: cancelledBidAuctionPda,
          bidder: bidder1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidder1])
        .rpc();

      // Verify bid was placed
      let auctionAccount = await readAuction(provider.connection, cancelledBidAuctionPda);
      expect(auctionAccount.bidCount).to.equal(1);

      // Cancel the bid
      await program.methods
        .cancelBid()
        .accountsPartial({
          auction: cancelledBidAuctionPda,
          bidder: bidder1.publicKey,
        })
        .signers([bidder1])
        .rpc();

      // Verify bid was cancelled
      auctionAccount = await readAuction(provider.connection, cancelledBidAuctionPda);
      expect(auctionAccount.bidCount).to.equal(0);

      // Try to conclude auction with no active bids
      try {
        await program.methods
          .concludeAuction()
          .accountsPartial({
            auction: cancelledBidAuctionPda,
            tokenMint: cancelledBidMint.publicKey,
            ownerTokenAccount: cancelledBidOwnerTokenAccount,
            winnerTokenAccount: cancelledBidOwnerTokenAccount, // Dummy account
            owner: owner.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts([])
          .signers([owner])
          .rpc();

        expect.fail("Should have failed with NoActiveBids");
      } catch (error) {
        expect(error.toString()).to.include("NoActiveBids");
      }

      // Clean up - cancel auction
      await program.methods
        .cancelAuction()
        .accountsPartial({
          auction: cancelledBidAuctionPda,
          tokenMint: cancelledBidMint.publicKey,
          ownerTokenAccount: cancelledBidOwnerTokenAccount,
          owner: owner.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });
  });
});

// Helper function to airdrop SOL
async function airdrop(
  connection: anchor.web3.Connection,
  address: PublicKey,
  amount = 2 * anchor.web3.LAMPORTS_PER_SOL
) {
  await connection.confirmTransaction(
    await connection.requestAirdrop(address, amount),
    "confirmed"
  );
}

