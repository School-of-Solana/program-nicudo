use crate::error::BiddingError;
use crate::state::Auction;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

pub fn process(ctx: Context<ConcludeAuction>) -> Result<()> {
    let auction = ctx.accounts.auction.load()?;

    require!(auction.bid_count > 0, BiddingError::NoActiveBids);

    let top_bid = auction.get_top_bid().ok_or(BiddingError::NoActiveBids)?;

    let winning_amount = top_bid.lamports;
    let winner_key = top_bid.bidder;

    msg!("Auction concluded!");
    msg!("Winner: {}", winner_key);
    msg!("Winning amount: {} lamports", winning_amount);

    // Verify the winner token account matches the actual winner
    let expected_winner_token_account = anchor_spl::associated_token::get_associated_token_address(
        &winner_key,
        &ctx.accounts.token_mint.key(),
    );
    require!(
        ctx.accounts.winner_token_account.key() == expected_winner_token_account,
        BiddingError::InvalidWinner
    );

    // Transfer token from owner to winner (owner signs)
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.winner_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        1, // Transfer 1 token
    )?;

    // Transfer winning bid amount from auction account to owner
    **ctx
        .accounts
        .auction
        .to_account_info()
        .try_borrow_mut_lamports()? -= winning_amount;
    **ctx
        .accounts
        .owner
        .to_account_info()
        .try_borrow_mut_lamports()? += winning_amount;

    msg!("Transferred {} lamports to auction owner", winning_amount);

    // Refund all other bidders by transferring lamports from auction account
    for bid in auction.bids.iter() {
        if bid.bidder != Pubkey::default() && bid.bidder != winner_key {
            **ctx
                .accounts
                .auction
                .to_account_info()
                .try_borrow_mut_lamports()? -= bid.lamports;

            // Find bidder account in remaining_accounts and transfer lamports
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
    msg!("Auction closed, rent returned to owner");

    Ok(())
}

#[derive(Accounts)]
pub struct ConcludeAuction<'info> {
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

    /// CHECK: Winner token account - validated to match actual winner's ATA in handler
    /// Must be initialized before calling this instruction
    #[account(mut)]
    pub winner_token_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
