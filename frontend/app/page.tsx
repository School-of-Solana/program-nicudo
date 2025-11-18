'use client';

import dynamic from 'next/dynamic';
import { ProgramInteraction } from '@/components/ProgramInteraction';

const WalletButton = dynamic(() => import('@/components/WalletButton').then(mod => mod.WalletButton), { ssr: false });

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <WalletButton />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-8">
          My Solana dApp
        </h1>
        <ProgramInteraction />
      </div>
    </main>
  );
}

