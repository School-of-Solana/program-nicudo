'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const WalletButton = () => {
  return (
    <div className="flex justify-end p-4">
      <WalletMultiButton />
    </div>
  );
};
