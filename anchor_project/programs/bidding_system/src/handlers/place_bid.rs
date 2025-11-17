use crate::error::BiddingError;
use crate::state::Auction;
use crate::utils::MAX_BIDS;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, System};

pub fn process(ctx: Context<PlaceBid>, lamports: u64) -> Result<()> {
    require!(lamports > 0, BiddingError::InvalidBidAmount);

    let bidder = ctx.accounts.bidder.key();

    // Get existing bid and check constraints
    let existing_bid = {
        let auction = ctx.accounts.auction.load()?;

        // Check if the auction is concluded
        require!(
            (auction.bid_count as usize) < MAX_BIDS,
            BiddingError::AuctionConcluded
        );

        auction
            .find_bid_index(&bidder)
            .map(|idx| auction.bids[idx].lamports)
            .unwrap_or(0)
    };

    // Make sure that there's an actual change
    require!(lamports != existing_bid, BiddingError::NoBidChange);

    if lamports > existing_bid {
        // Increasing bid - transfer additional lamports from bidder to auction account
        let additional_lamports = lamports - existing_bid;

        require!(
            **ctx.accounts.bidder.to_account_info().lamports.borrow() >= additional_lamports,
            BiddingError::InsufficientFunds
        );

        let auction_info = ctx.accounts.auction.to_account_info();
        let bidder_info = ctx.accounts.bidder.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();

        system_program::transfer(
            CpiContext::new(
                system_program_info,
                system_program::Transfer {
                    from: bidder_info,
                    to: auction_info,
                },
            ),
            additional_lamports,
        )?;
    } else {
        // Decreasing bid - refund excess lamports from auction account back to bidder
        let refund_amount = existing_bid - lamports;
        **ctx
            .accounts
            .auction
            .to_account_info()
            .try_borrow_mut_lamports()? -= refund_amount;
        **ctx
            .accounts
            .bidder
            .to_account_info()
            .try_borrow_mut_lamports()? += refund_amount;
    }

    // Now update the bid in auction state
    let mut auction = ctx.accounts.auction.load_mut()?;
    let max_reached = auction.upsert_bid(bidder, lamports)?;

    msg!("Bid placed by {}: {} lamports", bidder, lamports);
    msg!("Total bids: {}", auction.bid_count);

    if let Some(top) = auction.get_top_bid() {
        msg!(
            "Current top bid: {} lamports by {}",
            top.lamports,
            top.bidder
        );
    }

    // Signal when max bids reached - owner must call conclude_auction
    if max_reached {
        msg!("Max bids reached! Auction concluded. Awaiting owner action.");
    }

    Ok(())
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(
        mut,
        seeds = [b"auction", auction.load()?.token_mint.as_ref()],
        bump
    )]
    pub auction: AccountLoader<'info, Auction>,

    #[account(mut)]
    pub bidder: Signer<'info>,

    pub system_program: Program<'info, System>,
}
