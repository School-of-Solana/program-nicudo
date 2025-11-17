use crate::utils::MAX_BIDS;
use anchor_lang::prelude::*;

/// Main auction state account
#[account(zero_copy)]
#[repr(C)]
#[derive(Default)]
pub struct Auction {
    pub owner: Pubkey,            // 32 bytes
    pub token_mint: Pubkey,       // 32 bytes
    pub bids: [Bid; MAX_BIDS],    // 48 * 10 = 480 bytes
    pub bid_count: u8,            // 1 byte
    pub next_insertion_index: u8, // 1 byte - tracks next insertion index to assign
    pub padding: [u8; 6],         // 6 bytes padding for 64-bit alignment
}

impl Auction {
    /// Initialize a new auction with owner and token mint
    pub fn initialize(&mut self, owner: Pubkey, token_mint: Pubkey) {
        self.owner = owner;
        self.token_mint = token_mint;
        self.bids = [Bid::default(); MAX_BIDS];
        self.bid_count = 0;
        self.next_insertion_index = 1; // Start at 1
        self.padding = [0u8; 6];
    }

    /// Check if a bid slot is empty (zero sentinel)
    fn is_empty_bid(bid: &Bid) -> bool {
        bid.bidder == Pubkey::default()
    }

    /// Find the index of a bid by bidder
    pub fn find_bid_index(&self, bidder: &Pubkey) -> Option<usize> {
        self.bids
            .iter()
            .position(|b| !Self::is_empty_bid(b) && b.bidder == *bidder)
    }

    /// Check if bidder has an existing bid
    pub fn has_bid(&self, bidder: &Pubkey) -> bool {
        self.find_bid_index(bidder).is_some()
    }

    /// Get the top bid (highest amount, lowest insertion_index for ties)
    pub fn get_top_bid(&self) -> Option<&Bid> {
        self.bids
            .iter()
            .filter(|b| !Self::is_empty_bid(b))
            .max_by(|a, b| {
                // First compare by lamports (higher is better)
                match a.lamports.cmp(&b.lamports) {
                    std::cmp::Ordering::Equal => {
                        // If equal, lower insertion_index wins (earlier bid)
                        b.insertion_index.cmp(&a.insertion_index)
                    }
                    other => other,
                }
            })
    }

    /// Add or update a bid
    /// Returns Ok(true) if max bidders reached after this operation, Ok(false) otherwise
    pub fn upsert_bid(&mut self, bidder: Pubkey, lamports: u64) -> Result<bool> {
        if let Some(idx) = self.find_bid_index(&bidder) {
            // Update existing bid - assign highest insertion index
            let old_insertion_index = self.bids[idx].insertion_index;
            let new_insertion_index = self.next_insertion_index;

            self.bids[idx].lamports = lamports;
            self.bids[idx].insertion_index = new_insertion_index;

            // Decrement insertion indices higher than old value
            for bid in self.bids.iter_mut() {
                if !Self::is_empty_bid(bid) && bid.insertion_index > old_insertion_index {
                    bid.insertion_index -= 1;
                }
            }

            self.next_insertion_index += 1;
            Ok(false)
        } else {
            // Add new bid
            require!(
                (self.bid_count as usize) < MAX_BIDS,
                crate::error::BiddingError::MaxBidsReached
            );

            // Find first empty slot
            let empty_idx = self
                .bids
                .iter()
                .position(Self::is_empty_bid)
                .ok_or(crate::error::BiddingError::MaxBidsReached)?;

            self.bids[empty_idx] = Bid {
                bidder,
                lamports,
                insertion_index: self.next_insertion_index,
                padding: [0u8; 7],
            };
            self.bid_count += 1;
            self.next_insertion_index += 1;
            Ok(self.bid_count as usize == MAX_BIDS)
        }
    }

    /// Remove a bid
    pub fn remove_bid(&mut self, bidder: &Pubkey) -> Result<()> {
        let idx = self
            .find_bid_index(bidder)
            .ok_or(crate::error::BiddingError::NoBidFound)?;

        let removed_insertion_index = self.bids[idx].insertion_index;
        self.bids[idx] = Bid::default();
        self.bid_count -= 1;

        // Decrement insertion indices higher than the removed bid
        for bid in self.bids.iter_mut() {
            if !Self::is_empty_bid(bid) && bid.insertion_index > removed_insertion_index {
                bid.insertion_index -= 1;
            }
        }

        // Decrement next_insertion_index since we removed a bid
        self.next_insertion_index -= 1;

        Ok(())
    }
}

/// Individual bid information
#[zero_copy]
#[repr(C)]
#[derive(Default)]
pub struct Bid {
    pub bidder: Pubkey,      // 32 bytes
    pub lamports: u64,       // 8 bytes
    pub insertion_index: u8, // 1 byte - order of bid placement
    pub padding: [u8; 7],    // 7 bytes - for 64-bit alignment
}
