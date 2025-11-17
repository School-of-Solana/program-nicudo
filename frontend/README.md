# SPL Token Auction System - Frontend

A Next.js frontend for the Solana SPL Token Auction bidding system built with the create-solana-dapp template.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4 with Shadcn UI
- **Solana Integration**: 
  - `@coral-xyz/anchor` for program interaction
  - [Gill](https://gill.site/) Solana SDK for transaction building
  - Shadcn [Wallet UI](https://registry.wallet-ui.dev) for wallet connection
- **UI Components**: Radix UI primitives with custom styling

## Getting Started

### Installation

```shell
npm install
# or
yarn install
```

### Development

```shell
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```shell
npm run build
```

## Program Configuration

- **Program ID (devnet)**: `Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ`
- **IDL Location**: `src/lib/anchor/bidding_system.json`

## Project Structure

```
src/
├── app/                          # Next.js app router
│   └── page.tsx                  # Home page (bidding feature)
├── components/
│   ├── ui/                       # Reusable UI components
│   └── solana/                   # Solana-specific components
├── features/
│   └── bidding/                  # Bidding system feature
│       ├── bidding-feature.tsx   # Main bidding UI
│       └── hooks/                # Custom hooks
└── lib/
    └── anchor/                   # Anchor program integration
        ├── bidding_system.json   # Program IDL
        ├── types.ts              # TypeScript types
        └── program.ts            # Program utilities
```

## Features

### Implemented
- ✅ Wallet connection (Phantom, Solflare, etc.)
- ✅ Network selection (Devnet, Mainnet)
- ✅ Basic UI structure with tabs
- ✅ Program IDL integration

### To Do
- ⏳ Create auction (mint SPL token + create auction account)
- ⏳ View active auctions with bid history
- ⏳ Place/update bids
- ⏳ Cancel bids
- ⏳ Conclude auction (owner only)
- ⏳ Cancel auction (owner only)

## Program Instructions

### Create Auction
Creates a new auction with an SPL token including metadata

### Place Bid
Places or updates a bid on an auction (max 10 bids per auction)

### Cancel Bid
Cancels an existing bid and refunds lamports

### Conclude Auction
Finalizes the auction, transfers SPL token to winner and lamports to owner

### Cancel Auction
Cancels an active auction, refunds all bids, returns SPL token to owner

## Development

### Updating the IDL

When the Anchor program changes:
```bash
cp ../anchor_project/target/idl/bidding_system.json src/lib/anchor/
```

## Resources

- [Anchor framework](https://www.anchor-lang.com/)
- [Solana documentation](https://docs.solana.com/)
- [Next.js documentation](https://nextjs.org/docs)
- [Gill SDK](https://gill.site/)
- [Wallet UI](https://registry.wallet-ui.dev)

