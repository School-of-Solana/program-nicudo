use crate::state::Auction;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3,
    Metadata,
};
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

pub fn process(
    ctx: Context<CreateAuction>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let auction = &mut ctx.accounts.auction.load_init()?;
    auction.initialize(ctx.accounts.owner.key(), ctx.accounts.mint.key());

    // Mint exactly one token to the owner
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.token_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::mint_to(cpi_ctx, 1)?;

    // Create metadata with description in the name/uri
    let metadata_ctx = CpiContext::new(
        ctx.accounts.metadata_program.to_account_info(),
        CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: ctx.accounts.owner.to_account_info(),
            payer: ctx.accounts.owner.to_account_info(),
            update_authority: ctx.accounts.owner.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        },
    );

    let data_v2 = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    create_metadata_accounts_v3(metadata_ctx, data_v2, true, true, None)?;

    msg!("Auction created: {}", ctx.accounts.auction.key());
    msg!("Token mint: {}", auction.token_mint);
    msg!("Owner: {}", auction.owner);

    Ok(())
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct CreateAuction<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<Auction>(),
        seeds = [b"auction", mint.key().as_ref()],
        bump
    )]
    pub auction: AccountLoader<'info, Auction>,

    #[account(
        init,
        payer = owner,
        mint::decimals = 0,
        mint::authority = owner,
    )]
    pub mint: Account<'info, Mint>,

    /// CHECK: Validated by Metadata program
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = owner,
    )]
    pub token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
