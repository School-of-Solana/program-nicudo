use anchor_lang::prelude::*;

#[error_code]
pub enum BiddingError {
    #[msg("Invalid bid amount")]
    InvalidBidAmount,
    #[msg("Maximum number of bids reached")]
    MaxBidsReached,
    #[msg("No bid found for this bidder")]
    NoBidFound,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("No active bids in auction")]
    NoActiveBids,
    #[msg("Provided winner account does not match top bidder")]
    InvalidWinner,
    #[msg("Auction is concluded and awaiting finalization")]
    AuctionConcluded,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Bid amount unchanged from existing bid")]
    NoBidChange,
}
