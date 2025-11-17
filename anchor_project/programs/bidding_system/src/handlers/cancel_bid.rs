use crate::error::BiddingError;
use crate::state::Auction;
use crate::utils::MAX_BIDS;
use anchor_lang::prelude::*;

pub fn process(ctx: Context<CancelBid>) -> Result<()> {
    let mut auction = ctx.accounts.auction.load_mut()?;
    let bidder = ctx.accounts.bidder.key();

    // Check if the auction is concluded - conclude_auction is the only operation allowed if max bids reached
    require!(
        (auction.bid_count as usize) < MAX_BIDS,
        BiddingError::AuctionConcluded
    );

    // Get bid amount before removing
    let bid_amount = auction
        .find_bid_index(&bidder)
        .map(|idx| auction.bids[idx].lamports)
        .ok_or(crate::error::BiddingError::NoBidFound)?;

    // Remove the bid
    auction.remove_bid(&bidder)?;

    // Refund lamports from auction account to bidder
    **ctx
        .accounts
        .auction
        .to_account_info()
        .try_borrow_mut_lamports()? -= bid_amount;
    **ctx
        .accounts
        .bidder
        .to_account_info()
        .try_borrow_mut_lamports()? += bid_amount;

    msg!("Bid cancelled by {}", bidder);
    msg!("Refunded {} lamports", bid_amount);
    msg!("Remaining bids: {}", auction.bid_count);

    if let Some(top_bid) = auction.get_top_bid() {
        msg!(
            "New top bid: {} lamports by {}",
            top_bid.lamports,
            top_bid.bidder
        );
    } else {
        msg!("No bids remaining");
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CancelBid<'info> {
    #[account(
        mut,
        seeds = [b"auction", auction.load()?.token_mint.as_ref()],
        bump
    )]
    pub auction: AccountLoader<'info, Auction>,

    #[account(mut)]
    pub bidder: Signer<'info>,
}
