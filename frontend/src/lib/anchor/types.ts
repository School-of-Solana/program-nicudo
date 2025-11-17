export type BiddingSystem = {
  "address": "Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ",
  "metadata": {
    "name": "bidding_system",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancel_auction",
      "discriminator": [
        156,
        43,
        197,
        110,
        218,
        105,
        143,
        182
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "token_mint",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "owner_token_account",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "token_program"
        },
        {
          "name": "system_program"
        }
      ],
      "args": []
    },
    {
      "name": "cancel_bid",
      "discriminator": [
        40,
        243,
        190,
        217,
        208,
        253,
        86,
        206
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "conclude_auction",
      "discriminator": [
        77,
        53,
        63,
        226,
        102,
        234,
        218,
        187
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "token_mint",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "owner_token_account",
          "writable": true
        },
        {
          "name": "winner_token_account",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "token_program"
        },
        {
          "name": "associated_token_program"
        },
        {
          "name": "system_program"
        }
      ],
      "args": []
    },
    {
      "name": "create_auction",
      "discriminator": [
        234,
        6,
        201,
        246,
        47,
        219,
        176,
        107
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "metadata",
          "writable": true
        },
        {
          "name": "token_account",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program"
        },
        {
          "name": "associated_token_program"
        },
        {
          "name": "metadata_program"
        },
        {
          "name": "system_program"
        },
        {
          "name": "rent"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        }
      ]
    },
    {
      "name": "place_bid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Auction",
      "discriminator": [
        218,
        94,
        247,
        242,
        126,
        233,
        131,
        81
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidBidAmount",
      "msg": "Invalid bid amount"
    },
    {
      "code": 6001,
      "name": "MaxBidsReached",
      "msg": "Maximum number of bids reached"
    },
    {
      "code": 6002,
      "name": "NoBidFound",
      "msg": "No bid found for this bidder"
    },
    {
      "code": 6003,
      "name": "Unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6004,
      "name": "NoActiveBids",
      "msg": "No active bids in auction"
    },
    {
      "code": 6005,
      "name": "InvalidWinner",
      "msg": "Provided winner account does not match top bidder"
    },
    {
      "code": 6006,
      "name": "AuctionConcluded",
      "msg": "Auction is concluded and awaiting finalization"
    },
    {
      "code": 6007,
      "name": "InsufficientFunds",
      "msg": "Insufficient funds"
    },
    {
      "code": 6008,
      "name": "NoBidChange",
      "msg": "Bid amount unchanged from existing bid"
    }
  ],
  "types": [
    {
      "name": "Auction",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "token_mint",
            "type": "pubkey"
          },
          {
            "name": "bids",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "Bid"
                  }
                },
                10
              ]
            }
          },
          {
            "name": "bid_count",
            "type": "u8"
          },
          {
            "name": "next_insertion_index",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "Bid",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "lamports",
            "type": "u64"
          },
          {
            "name": "insertion_index",
            "type": "u8"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    }
  ]
}

export const BIDDING_SYSTEM_PROGRAM_ID = "Ge7UMMiNcjeq3awXbcbfcmjVNw4EmfBmPuJDvjGtRRKQ";
