#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

declare_id!("HHdGDLRcNY9hf9TMg78grzheCpDG21wrmVM4wEWwsQ5u");

pub mod error;
mod handlers;
pub mod state;
pub mod utils;

use handlers::*;

#[program]
pub mod bidding_system {
    use super::*;

    /// Create a new auction with a token containing metadata
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        handlers::create_auction::process(ctx, name, symbol, uri)
    }

    /// Place a bid on an auction (replaces previous bid from same address if exists)
    pub fn place_bid(ctx: Context<PlaceBid>, lamports: u64) -> Result<()> {
        handlers::place_bid::process(ctx, lamports)
    }

    /// Cancel a bid
    pub fn cancel_bid(ctx: Context<CancelBid>) -> Result<()> {
        handlers::cancel_bid::process(ctx)
    }

    /// Conclude an auction and determine winner
    pub fn conclude_auction(ctx: Context<ConcludeAuction>) -> Result<()> {
        handlers::conclude_auction::process(ctx)
    }

    /// Cancel an active auction
    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        handlers::cancel_auction::process(ctx)
    }
}
