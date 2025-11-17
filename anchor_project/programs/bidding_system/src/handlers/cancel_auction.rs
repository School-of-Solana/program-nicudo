use crate::error::BiddingError;
use crate::state::Auction;
use crate::utils::MAX_BIDS;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

pub fn process(ctx: Context<CancelAuction>) -> Result<()> {
    let auction = ctx.accounts.auction.load()?;

    // Check if the auction is concluded - conclude_auction is the only operation allowed if max bids reached
    require!(
        (auction.bid_count as usize) < MAX_BIDS,
        BiddingError::AuctionConcluded
    );

    msg!("Auction cancelled: {}", ctx.accounts.auction.key());

    // Burn the minted token
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Burn {
                mint: ctx.accounts.token_mint.to_account_info(),
                from: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        1, // Burn 1 token
    )?;

    msg!("Token burned");

    // Refund all bidders by transferring lamports from auction account
    for bid in auction.bids.iter() {
        if bid.bidder != Pubkey::default() {
            **ctx
                .accounts
                .auction
                .to_account_info()
                .try_borrow_mut_lamports()? -= bid.lamports;

            // Create account info for bidder and transfer lamports
            let bidder_account = ctx
                .remaining_accounts
                .iter()
                .find(|acc| acc.key() == bid.bidder)
                .ok_or(BiddingError::NoBidFound)?;

            **bidder_account.try_borrow_mut_lamports()? += bid.lamports;
            msg!("Refunded {} lamports to {}", bid.lamports, bid.bidder);
        }
    }

    // Auction account will be closed by close constraint, rent returned to owner
    msg!("All bids refunded, auction closed, rent returned to owner");

    Ok(())
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    #[account(
        mut,
        has_one = owner,
        has_one = token_mint,
        seeds = [b"auction", auction.load()?.token_mint.as_ref()],
        bump,
        close = owner
    )]
    pub auction: AccountLoader<'info, Auction>,

    #[account(mut)]
    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
