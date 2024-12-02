'use client';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { createBurnInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getMetaplex } from '@/utils/metaplex';
import Image from 'next/image';
import { getJupiterApiClient } from '@/utils/jupiterApiClient';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { TrashIcon } from '@heroicons/react/24/outline';
import { createCloseAccountInstruction } from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import toast, { Toaster } from 'react-hot-toast';
import { getAddressLink, getDexScreenerLink, getRaydiumLink } from '@/utils/explorer';

interface TokenAccount {
    pubkey: string;
    mint: string;
    amount: number;
    decimals: number;
    metadata?: {
        name?: string;
        symbol?: string;
        uri?: string;
        imageUrl?: string;
    };
    price?: number | null;
}

const formatPrice = (price: number) => {
    if (price === 0) return '$0.00';
    
    const priceStr = price.toString();
    
    // If price is less than 0.01
    if (price < 0.01) {
        // Count leading zeros after decimal point
        const match = priceStr.match(/^0\.0+/);
        if (match) {
            const leadingZeros = match[0].length - 2; // subtract 2 for "0."
            const significantDigits = priceStr.slice(match[0].length);
            // Return JSX-compatible format
            return ['$0.0', <sub key="zeros">({leadingZeros})</sub>, significantDigits.slice(0, 3)];
        }
    }
    
    return `$${price.toFixed(2)}`;
};

const getTotalValueColorClass = (value: number): string => {
    if (value >= 100) return "text-purple-400"; // Highest value - Purple
    if (value >= 50) return "text-pink-400";    // Very high value - Pink
    if (value >= 10) return "text-yellow-400";  // High value - Yellow
    if (value >= 5) return "text-blue-400";     // Medium value - Blue
    if (value >= 1) return "text-cyan-400";     // Low value - Cyan
    return "text-gray-400";                     // Very low value - Gray
};

const copyToClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success('Token address copied to clipboard!', {
            duration: 2000,
            style: {
                background: '#1a1b1e',
                color: '#fff',
                border: '1px solid #2d2e33'
            },
        });
    } catch (err) {
        console.error('Failed to copy text: ', err);
        toast.error('Failed to copy token address', {
            style: {
                background: '#1a1b1e',
                color: '#fff',
                border: '1px solid #2d2e33'
            },
        });
    }
};

const Tokens = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [tokenAccounts, setTokenAccounts] = useState<TokenAccount[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        show: boolean;
        token?: TokenAccount;
    }>({ show: false });
    const wallet = useWallet();
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedTokens, setSelectedTokens] = useState<Set<TokenAccount>>(new Set());

    const fetchMetadataUri = async (uri: string) => {
        try {
            const response = await fetch(uri);
            const json = await response.json();
            return json.image || null;
        } catch (error) {
            console.log('Error fetching metadata URI:', error);
            return null;
        }
    };

    const fetchTokenPrice = async (mint: string) => {
        try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
                method: 'GET',
                headers: {},
            });
            const data = await response.json();
            const dataPairs = data.pairs;
            const validPairs = dataPairs.filter((pair: any) => pair.baseToken.address === mint);
            const totalPrice = validPairs.reduce((acc: number, pair: any) => acc + Number(pair.priceUsd), 0);
            const averagePrice = totalPrice / validPairs.length;

            return Number(averagePrice);
        } catch (error) {
            console.log('Error fetching token price:', error);
            return null;
        }
    };

    useEffect(() => {
        const fetchTokenAccounts = async () => {
            if (!publicKey) return;

            try {
                const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: TOKEN_PROGRAM_ID,
                });

                // accounts.value.sort((a, b) => {
                //     const aAmount = Number(a.account.data.parsed.info.tokenAmount.uiAmount);
                //     const bAmount = Number(b.account.data.parsed.info.tokenAmount.uiAmount);
                //     return aAmount - bAmount;
                // });

                const metaplex = getMetaplex();

                const tokens = await Promise.all(
                    accounts.value.map(async (account) => {
                        const parsedInfo = account.account.data.parsed.info;
                        const mintAddress = new PublicKey(parsedInfo.mint);

                        let metadata = {};
                        try {
                            const nft = await metaplex.nfts().findByMint({ mintAddress });
                            const imageUrl = nft.uri ? await fetchMetadataUri(nft.uri) : null;

                            metadata = {
                                name: nft.name,
                                symbol: nft.symbol,
                                uri: nft.uri,
                                imageUrl
                            };
                        } catch (error) {
                            console.log(`No metadata for token ${parsedInfo.mint}`);
                        }

                        const price = await fetchTokenPrice(parsedInfo.mint);

                        return {
                            mint: parsedInfo.mint,
                            amount: parsedInfo.tokenAmount.uiAmount,
                            decimals: parsedInfo.tokenAmount.decimals,
                            metadata,
                            price,
                            pubkey: account.pubkey.toBase58(),
                        };
                    })
                );

                // Sort tokens by total value (price * amount) first, then by amount
                tokens.sort((a, b) => {
                    const aValue = (a.price || 0) * a.amount;
                    const bValue = (b.price || 0) * b.amount;

                    // If total values are different, sort by that
                    if (aValue !== bValue) {
                        return aValue - bValue; // Descending order
                    }
                    
                    // If total values are equal, sort by amount
                    return a.amount - b.amount; // Ascending order
                });
                setTokenAccounts(tokens);
            } catch (error) {
                console.error('Error fetching token accounts:', error);
            }
        };

        fetchTokenAccounts();
    }, [connection, publicKey]);

    const closeMultipleTokenAccounts = async (tokens: TokenAccount[]) => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            console.error('Wallet not connected');
            return;
        }

        setIsProcessing(true);
        try {
            // Create a new transaction
            const transaction = new Transaction();
            
            // Add close instruction for each token account
            for (const token of tokens) {
                if (token.amount > 0) {
                    const burnInstruction = createBurnInstruction(
                        new PublicKey(token.pubkey),
                        new PublicKey(token.mint),
                        wallet.publicKey,
                        Number(token.amount * Math.pow(10, token.decimals)),
                    );
                    transaction.add(burnInstruction);
                }
                const closeInstruction = createCloseAccountInstruction(
                    new PublicKey(token.pubkey),
                    wallet.publicKey,
                    wallet.publicKey,
                    []
                );
                transaction.add(closeInstruction);
            }

            // Add transfer to fee receiver instruction
            const feeReceiverAddress = process.env.NEXT_PUBLIC_FEE_RECEIVER || "";
            const feeAmount = process.env.NEXT_PUBLIC_FEE_AMOUNT || 100000;
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: new PublicKey(feeReceiverAddress),
                lamports: Number(feeAmount) * tokens.length,
            });
            transaction.add(transferInstruction);

            // Get latest blockhash
            const latestBlockhash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.feePayer = wallet.publicKey;

            // Show processing toast
            toast.loading('Confirming transaction...', {
                id: 'tx-confirmation',
                style: {
                    background: '#1a1b1e',
                    color: '#fff',
                    border: '1px solid #2d2e33'
                },
            });

            // Sign and send transaction
            const signedTransaction = await wallet.signTransaction(transaction);
            const signature = await connection.sendRawTransaction(signedTransaction.serialize());

            // Wait for confirmation
            await connection.confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            });

            // Update local state
            setTokenAccounts(prev => prev.filter(t => !tokens.some(selected => selected.mint === t.mint)));
            setSelectedTokens(new Set());

            // Show success notification
            toast.dismiss('tx-confirmation');
            toast.success(
                <div>
                    Successfully closed {tokens.length} token accounts
                    <a 
                        href={`${getAddressLink(signature)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 ml-2"
                    >
                        View Transaction
                    </a>
                </div>,
                {
                    duration: 5000,
                    style: {
                        background: '#1a1b1e',
                        color: '#fff',
                        border: '1px solid #2d2e33'
                    },
                }
            );

        } catch (error) {
            console.error('Error closing token accounts:', error);
            toast.dismiss('tx-confirmation');
            toast.error('Failed to close token accounts', {
                style: {
                    background: '#1a1b1e',
                    color: '#fff',
                    border: '1px solid #2d2e33'
                },
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleTokenSelection = (token: TokenAccount) => {
        setSelectedTokens(prev => {
            const newSet = new Set(prev);
            // Need to check by mint since Set comparison uses reference equality
            const existingToken = Array.from(newSet).find(t => t.mint === token.mint);
            if (existingToken) {
                newSet.delete(existingToken);
            } else {
                newSet.add(token);
            }
            return newSet;
        });
    };

    return (
        <>
            <div className="min-h-[90vh] bg-black text-white">
                <div className="max-w-[1440px] mx-auto p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Your Token Accounts</h2>
                        
                        {selectedTokens.size > 0 && (
                            <button
                                onClick={() => closeMultipleTokenAccounts(Array.from(selectedTokens))}
                                disabled={isProcessing}
                                className={`flex items-center gap-2 px-4 py-2 ${
                                    isProcessing 
                                        ? 'bg-red-600/50 cursor-not-allowed' 
                                        : 'bg-red-600 hover:bg-red-500'
                                } transition-colors rounded-lg text-white`}
                            >
                                {isProcessing ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle 
                                                className="opacity-25" 
                                                cx="12" 
                                                cy="12" 
                                                r="10" 
                                                stroke="currentColor" 
                                                strokeWidth="4"
                                                fill="none"
                                            />
                                            <path 
                                                className="opacity-75" 
                                                fill="currentColor" 
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            />
                                        </svg>
                                        <span>Processing...</span>
                                    </>
                                ) : (
                                    <>
                                        <TrashIcon className="w-5 h-5" />
                                        <span>Delete Token Accounts ({selectedTokens.size})</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            {/* Table Header */}
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="text-left pb-4 font-medium text-gray-400 w-[40%] border-r border-gray-700">Token</th>
                                    <th className="text-left pb-4 font-medium text-gray-400 w-[20%] border-r border-gray-700 pl-4">Amount</th>
                                    <th className="text-left pb-4 font-medium text-gray-400 w-[15%] border-r border-gray-700 pl-4">Price</th>
                                    <th className="text-left pb-4 font-medium text-gray-400 w-[15%] border-r border-gray-700 pl-4">Total</th>
                                    <th className="pb-4 w-[10%] text-center">Actions</th>
                                </tr>
                            </thead>

                            {/* Table Body */}
                            <tbody>
                                {tokenAccounts.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-4">No tokens found</td>
                                    </tr>
                                ) : (
                                    tokenAccounts.map((token, index) => (
                                        <tr 
                                            key={index} 
                                            className={`border-b border-gray-700/50 transition-colors duration-200
                                                ${Array.from(selectedTokens).some(t => t.mint === token.mint)
                                                    ? 'bg-blue-900/20 hover:bg-blue-900/30' 
                                                    : 'hover:bg-gray-900/30'
                                                }
                                            `}
                                        >
                                            <td className="py-6 border-r border-gray-700/50">
                                                <div className="flex items-center gap-4">
                                                    {token.metadata?.imageUrl && (
                                                        <div className="w-12 h-12 relative rounded-full overflow-hidden flex-shrink-0">
                                                            <Image 
                                                                src={token.metadata.imageUrl}
                                                                alt={token.metadata?.name || 'Token'}
                                                                fill
                                                                className="object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-semibold truncate">
                                                            {token.metadata?.name || 'Unknown Token'} 
                                                            {token.metadata?.symbol && ` (${token.metadata.symbol})`}
                                                        </p>
                                                        <div 
                                                            className="relative group cursor-pointer"
                                                            onClick={() => copyToClipboard(token.mint)}
                                                        >
                                                            <p className="font-mono text-sm text-gray-400 truncate">
                                                                {token.mint}
                                                            </p>
                                                            <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 
                                                                bg-gray-900 text-white text-sm px-2 py-1 rounded opacity-0 
                                                                group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                                Click to copy token address
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="text-left py-6 border-r border-gray-700/50 pl-4">
                                                <a 
                                                    href={getRaydiumLink(token.mint)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="group relative cursor-pointer"
                                                >
                                                    <p className="font-semibold hover:text-blue-400 transition-colors">
                                                        {token.amount.toFixed(2)}
                                                    </p>
                                                    <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 
                                                        bg-gray-900 text-white text-sm px-2 py-1 rounded opacity-0 
                                                        group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                        Swap on Raydium
                                                    </span>
                                                </a>
                                            </td>

                                            <td className="text-left py-6 border-r border-gray-700/50 pl-4">
                                                {token.price && (
                                                    <a 
                                                        href={getDexScreenerLink(token.mint)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-semibold hover:text-blue-400 cursor-pointer group relative"
                                                    >
                                                        <p>{formatPrice(token.price)}</p>
                                                        <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 
                                                            bg-gray-900 text-white text-sm px-2 py-1 rounded opacity-0 
                                                            group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                            View on DexScreener
                                                        </span>
                                                    </a>
                                                )}
                                            </td>

                                            <td className="text-left py-6 border-r border-gray-700/50 pl-4">
                                                {token.price && (
                                                    <p className={`font-semibold ${getTotalValueColorClass(token.price * token.amount)}`}>
                                                        {formatPrice(token.price * token.amount)}
                                                    </p>
                                                )}
                                            </td>

                                            <td className="text-center py-6">
                                                <div className="flex items-center justify-center gap-4">
                                                    <button 
                                                        className="p-2 hover:bg-red-900/20 rounded-full transition-colors group relative"
                                                        onClick={() => setDeleteConfirm({ show: true, token })}
                                                    >
                                                        <TrashIcon className="w-5 h-5 text-red-500 hover:text-red-400" />
                                                        <span className="absolute -top-14 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-sm px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                                            Delete Token Account and redeem SOL
                                                        </span>
                                                    </button>

                                                    <input
                                                        type="checkbox"
                                                        checked={Array.from(selectedTokens).some(t => t.mint === token.mint)}
                                                        onChange={() => toggleTokenSelection(token)}
                                                        className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 bg-gray-700 cursor-pointer"
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Update Delete Confirmation Modal */}
                    {deleteConfirm.show && deleteConfirm.token && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                                <h3 className="text-xl font-semibold mb-4">Confirm Delete</h3>
                                <p className="text-gray-300 mb-6">
                                    Do you want to delete {deleteConfirm.token.metadata?.name || 'Unknown Token'} token and redeem SOL?
                                </p>
                                <div className="flex justify-end gap-4">
                                    <button
                                        className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                                        onClick={() => setDeleteConfirm({ show: false })}
                                        disabled={isProcessing}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className={`px-4 py-2 rounded ${
                                            isProcessing 
                                                ? 'bg-red-600/50 cursor-not-allowed' 
                                                : 'bg-red-600 hover:bg-red-500'
                                        } transition-colors flex items-center gap-2`}
                                        onClick={async () => {
                                            if (deleteConfirm.token) {
                                                await closeMultipleTokenAccounts([deleteConfirm.token]);
                                            }
                                            setDeleteConfirm({ show: false });
                                        }}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                    <circle 
                                                        className="opacity-25" 
                                                        cx="12" 
                                                        cy="12" 
                                                        r="10" 
                                                        stroke="currentColor" 
                                                        strokeWidth="4"
                                                        fill="none"
                                                    />
                                                    <path 
                                                        className="opacity-75" 
                                                        fill="currentColor" 
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                    />
                                                </svg>
                                                Processing...
                                            </>
                                        ) : (
                                            'Delete'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* Add Toaster component */}
            <Toaster position="bottom-right" />
        </>
    );
};

export default Tokens; 