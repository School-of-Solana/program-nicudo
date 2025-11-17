# Project Description

**Deployed Frontend URL:** [TODO: Link to your deployed frontend]

**Solana Program ID:** [TODO: Your deployed program's public key]

## Project Overview

### Description
A decentralized auction system for tokenized assets built on Solana. Users can create auctions by minting unique SPL tokens, place and manage bids with lamport escrow, and conclude auctions with automatic fund distribution. The system features a fixed-size bidding pool with state-locking once maximum capacity is reached, ensuring fair and transparent auction mechanics. Each auction is uniquely identified by its token mint and operates autonomously on-chain with all bid funds held in escrow until conclusion or cancellation.

### Key Features
- **Token Minting**: Create auctions with unique SPL tokens (decimals=0) and on-chain metadata
- **Flexible Bidding**: Place, update (increase/decrease), or cancel bids with automatic lamport escrow
- **State Locking**: Auctions automatically lock at 10 bidders, preventing further modifications
- **Owner-Controlled Conclusion**: Auction owners pay fees and manually finalize auctions
- **Automatic Refunds**: All non-winning bidders receive automatic lamport refunds on conclusion/cancellation
- **Zero-Copy Optimization**: Efficient account structure using zero-copy deserialization
  
### How to Use the dApp
1. **Connect Wallet** - Connect your Solana wallet (Phantom, Solflare, etc.)
2. **Create Auction** - Provide token name, symbol, and URI to mint a token and initialize an auction
3. **Place Bid** - Enter lamport amount and submit (can update or decrease your bid later)
4. **Monitor Status** - View current top bid and total bidder count
5. **Cancel Bid** (Optional) - Withdraw your bid before auction concludes (if not at max capacity)
6. **Conclude Auction** (Owner) - Once satisfied or max bidders reached, owner finalizes the auction
7. **Receive Rewards** - Winner gets token, owner gets winning bid, losers get refunds

## Program Architecture
The auction system uses a zero-copy account structure with a single PDA per token mint. The program implements five core instructions with modular handler organization. State management uses fixed-size arrays with zero sentinels for efficient memory usage and Pod compatibility.

### PDA Usage
The program uses Program Derived Addresses to create deterministic, unique auction accounts for each tokenized asset.

**PDAs Used:**
- **Auction PDA**: Derived from seeds `["auction", token_mint_pubkey]` - ensures each token mint has exactly one auction account that holds escrowed lamports and bid state. Only the program can sign for this PDA, enabling secure fund management without owner signatures during conclusion.

### Program Instructions
**Instructions Implemented:**
- **create_auction**: Mints a new SPL token (decimals=0), creates on-chain metadata, initializes auction PDA with owner and token mint
- **place_bid**: Escrows lamports from bidder to auction PDA, updates or inserts bid, locks auction state when 10th bidder joins
- **cancel_bid**: Removes bid from array, refunds escrowed lamports to bidder, decrements bid count (blocked if auction concluded)
- **conclude_auction**: Automatically determines winner via `get_top_bid()`, validates provided winner token account matches actual winner, transfers token to winner, distributes winning bid to owner, refunds all losing bidders, closes auction account (owner signs and pays fees)
- **cancel_auction**: Burns minted token, refunds all bidders, closes auction account (owner signs, blocked if auction concluded)

### Account Structure
```rust
#[account(zero_copy)]
#[repr(C)]
pub struct Auction {
    pub owner: Pubkey,              // 32 bytes - auction creator and token owner
    pub token_mint: Pubkey,         // 32 bytes - minted token mint address
    pub bids: [Bid; MAX_BIDS],      // 480 bytes - fixed array of 10 bids
    pub bid_count: u8,              // 1 byte - current number of active bidders
    pub next_insertion_index: u8,   // 1 byte - tracks next insertion order
    pub padding: [u8; 6],           // 6 bytes - 64-bit memory alignment
}

#[zero_copy]
#[repr(C)]
pub struct Bid {
    pub bidder: Pubkey,       // 32 bytes - bidder wallet address
    pub lamports: u64,        // 8 bytes - bid amount in lamports
    pub insertion_index: u8,  // 1 byte - bid placement order (tiebreaker)
    pub padding: [u8; 7],     // 7 bytes - 64-bit memory alignment
}
```

**Key Implementation Details:**
- Zero-copy with `AccountLoader` for efficient account access
- Fixed-size array with `Pubkey::default()` as zero sentinel for empty slots
- Insertion index tracking for deterministic tiebreaking (earlier bid wins on equal amounts)
- Automatic index reordering on updates (updated bid gets highest index) and cancellations (higher indices decremented)
- Total account size: 560 bytes (8 discriminator + 552 data)
- Auction concluded when `bid_count == MAX_BIDS` (10)

## Testing

### Test Coverage
Comprehensive test suite covering all instructions with successful operations and error conditions to ensure program security, economic model correctness, and state transition integrity.

**Happy Path Tests:**
- **Create Auction**: Successfully mints token, creates metadata, initializes auction PDA with correct owner and token mint
- **Place First Bid**: Escrows lamports, adds bid to array, increments bid_count from 0 to 1
- **Update Bid (Increase)**: Transfers additional lamports, updates existing bid amount
- **Update Bid (Decrease)**: Refunds excess lamports, updates existing bid to lower amount
- **Equal Bids Tiebreaker**: Places equal bids, verifies insertion indices are sequential, confirms earliest bid wins
- **Place 10th Bid**: Successfully adds final bid, sets bid_count to 10, locks auction state
- **Cancel Bid**: Removes bid, refunds lamports, decrements bid_count correctly
- **Conclude Auction**: Transfers token to top bidder, pays owner, refunds losing bidders, closes account
- **Cancel Auction**: Burns token, refunds all bidders, closes auction account

**Unhappy Path Tests:**
- **Place Bid (No Change)**: Fails with `NoBidChange` error when bid amount equals existing bid
- **Place Bid (Insufficient Funds)**: Fails with `InsufficientFunds` error when bidder lacks lamports
- **Place Bid (Concluded)**: Fails with `AuctionConcluded` error after max bidders reached
- **Cancel Bid (Not Found)**: Fails with `NoBidFound` error for non-existent bid
- **Cancel Bid (Concluded)**: Fails with `AuctionConcluded` error after max bidders reached
- **Cancel Auction (Concluded)**: Fails with `AuctionConcluded` error after max bidders reached
- **Conclude Auction (No Bids)**: Fails with `NoActiveBids` error when bid_count is 0

### Running Tests
```bash
cd bidding_system
anchor test     # run all tests
anchor test -- --nocapture  # run with console output
```

### Additional Notes for Evaluators

The implementation uses a fixed-size array for bids with zero-copy optimization. The state-locking mechanism is based on checking `bid_count == MAX_BIDS`. The economic model ensures owner pays conclusion fees by requiring separate transactions (10th bidder would have paid in inline auto-conclude). Bidder refunds use `remaining_accounts` pattern since we can't predict bidder addresses at compile time. The zero-copy optimization with `AccountLoader` and `#[repr(C)]` alignment significantly improved account access efficiency.

**Winner Determination**: The `conclude_auction` instruction automatically determines the winner using the program's internal `get_top_bid()` logic (highest lamports, with insertion_index as tiebreaker). The caller does not specify who won - they only provide the winner's token account address, which the program validates matches the expected Associated Token Account for the actual winner. This design prevents potential manipulation and ensures the program maintains authority over winner selection while allowing the client to prepare the necessary accounts.