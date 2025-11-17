# Bidding System - Solana Tokenized Asset Auction Program

A decentralized auction system for tokenized assets built on Solana using the Anchor framework. This program enables users to create token-based auctions, place competitive bids with lamport escrow, and conclude auctions with automatic fund distribution.

## Features

### Core Functionality
- **Token Auction Creation**: Mint unique SPL tokens and initialize auctions with on-chain metadata
- **Flexible Bidding**: Place, increase, decrease, or cancel bids with automatic escrow management
- **State Locking**: Auctions automatically lock when maximum capacity (10 bidders) is reached
- **Secure Conclusion**: Owner-controlled finalization with token transfer and fund distribution
- **Automatic Refunds**: Non-winning bidders receive automatic lamport refunds via `remaining_accounts`

### Technical Features
- **Zero-Copy Optimization**: Efficient account structure using `AccountLoader` and `#[zero_copy]`
- **Fixed-Size Arrays**: Pod-compatible storage with zero sentinels (`Pubkey::default()`)
- **PDA-Based Architecture**: Deterministic auction addresses derived from token mints
- **Modular Handlers**: Clean separation with `#[derive(Accounts)]` in handler files
- **64-bit Memory Alignment**: Optimized struct layout with padding

## Program Architecture

### Account Structure

```rust
#[account(zero_copy)]
#[repr(C)]
pub struct Auction {
    pub owner: Pubkey,           // 32 bytes
    pub token_mint: Pubkey,      // 32 bytes
    pub bids: [Bid; MAX_BIDS],   // 400 bytes (10 bids × 40 bytes)
    pub bid_count: u8,           // 1 byte
    pub padding: [u8; 7],        // 7 bytes alignment
}

#[zero_copy]
#[repr(C)]
pub struct Bid {
    pub bidder: Pubkey,    // 32 bytes
    pub lamports: u64,     // 8 bytes
}
```

**Constants:**
- `MAX_BIDS = 10` - Maximum number of concurrent bidders
- Total account size: 472 bytes (8 discriminator + 464 data)

### Program Instructions

1. **create_auction** - Initialize auction with token minting
   - Mints SPL token (decimals=0) to owner
   - Creates on-chain metadata (name, symbol, URI)
   - Initializes auction PDA with owner and token mint

2. **place_bid** - Submit or update bid
   - Escrows lamports to auction PDA
   - Supports increasing or decreasing existing bids
   - Locks auction when 10th bidder joins
   - Blocked when auction is concluded

3. **cancel_bid** - Withdraw bid before conclusion
   - Refunds escrowed lamports to bidder
   - Decrements bid count
   - Blocked when auction is concluded

4. **conclude_auction** - Finalize auction (owner only)
   - Transfers token to top bidder
   - Pays winning bid to auction owner
   - Refunds all losing bidders via `remaining_accounts`
   - Closes auction PDA (rent returned to owner)
   - Owner pays network fees

5. **cancel_auction** - Terminate auction (owner only)
   - Burns minted token
   - Refunds all bidders via `remaining_accounts`
   - Closes auction PDA
   - Blocked when auction is concluded

### PDA Derivation

**Auction PDA:**
- Seeds: `["auction", token_mint_pubkey]`
- Purpose: Unique, deterministic address per token mint
- Authority: Program-controlled for secure fund management

### Economic Model

**Escrow & Refunds:**
- Bids are escrowed in auction PDA lamports
- Increasing bids transfer additional lamports
- Decreasing bids refund excess immediately
- Conclusion refunds losers, pays owner, transfers token
- Cancellation refunds all bidders, burns token

**Fee Payment:**
- Auction owner pays conclusion/cancellation fees
- 10th bidder does NOT auto-conclude (owner must manually conclude)

**State Locking:**
- Auction concludes when `bid_count == MAX_BIDS`
- All mutations blocked except `conclude_auction`
- Ensures fair finalization without race conditions

## Project Structure

```
bidding_system/
├── programs/
│   └── bidding_system/
│       └── src/
│           ├── lib.rs                  # Program entry point
│           ├── state.rs                # Auction & Bid structs
│           ├── error.rs                # Custom error codes
│           ├── utils/
│           │   └── constants.rs        # MAX_BIDS constant
│           └── handlers/
│               ├── mod.rs
│               ├── create_auction.rs   # Token minting & initialization
│               ├── place_bid.rs        # Bid submission & updates
│               ├── cancel_bid.rs       # Bid withdrawal
│               ├── conclude_auction.rs # Auction finalization
│               └── cancel_auction.rs   # Auction termination
├── tests/
│   └── bidding_system.ts              # Anchor tests
├── Anchor.toml                         # Anchor configuration
└── Cargo.toml                          # Rust dependencies
```

## Dependencies

### Rust (Cargo.toml)
```toml
[dependencies]
anchor-lang = "0.31.1"
anchor-spl = "0.31.1"
mpl-token-metadata = "5.0.0"
bytemuck = "1.14"
```

### Features Used
- `anchor-lang`: Core framework with zero-copy support
- `anchor-spl`: Token and metadata program CPIs
- `mpl-token-metadata`: On-chain metadata standard for tokenized assets
- `bytemuck`: Pod/Zeroable traits for zero-copy

## Setup & Development

### Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.31.1
avm use 0.31.1

# Install Node.js dependencies
yarn install
```

### Build & Test
```bash
# Build program
anchor build

# Run tests
anchor test

# Run tests with output
anchor test -- --nocapture

# Deploy (configure cluster in Anchor.toml first)
anchor deploy
```

### Configuration
Edit `Anchor.toml`:
```toml
[provider]
cluster = "localnet"  # or "devnet" / "mainnet"
wallet = "~/.config/solana/id.json"
```

## Error Codes

```rust
pub enum BiddingError {
    InvalidBidAmount,      // Bid amount must be > 0
    MaxBidsReached,        // Auction at capacity (10 bidders) - should never be reached
    NoBidFound,            // Bidder has no active bid
    Unauthorized,          // Caller not authorized
    NoActiveBids,          // Auction has no bids
    InvalidWinner,         // Provided winner ≠ top bidder
    AuctionConcluded,      // Auction locked (bid_count == MAX_BIDS)
    InsufficientFunds,     // Bidder lacks lamports
    NoBidChange,           // Bid amount unchanged
}
```

## Implementation Notes

### Design Evolution
1. **Storage Migration**: `BTreeMap` → `Vec` → fixed-size arrays for Pod compatibility
2. **State Locking**: Simplified from `is_concluded` flag to `bid_count == MAX_BIDS` check
3. **Auto-Conclude**: Removed inline auto-conclude to ensure owner pays fees
4. **Zero-Copy**: Adopted `AccountLoader` with `#[repr(C)]` for efficiency
5. **Refund Pattern**: Uses `remaining_accounts` for dynamic bidder addresses

### Key Technical Decisions
- **Fixed Array Size**: Pod trait requires compile-time known sizes
- **Zero Sentinel**: `Pubkey::default()` marks empty bid slots
- **Owner Fee Payment**: Separate conclusion transaction required (not inline with 10th bid)
- **Memory Alignment**: 7-byte padding for 64-bit boundaries

### Security Considerations
- PDA authority prevents unauthorized fund access
- State locking prevents modifications after max capacity
- Winner validation ensures correct token recipient
- Bid count integrity maintained through careful increment/decrement

## Testing

Run comprehensive test suite:
```bash
anchor test
```

Test coverage includes:
- ✅ Auction creation with token minting
- ✅ Bid placement, updates (increase/decrease), and cancellation
- ✅ State locking at max capacity
- ✅ Auction conclusion with fund distribution
- ✅ Auction cancellation with refunds
- ✅ Error conditions (insufficient funds, unauthorized access, concluded auctions)

## Documentation

See also:
- `AUTO_CONCLUDE.md` - Detailed explanation of state locking and conclusion model
- `ECONOMIC_MODEL.md` - (if exists) Economic flow and fee structure

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]
