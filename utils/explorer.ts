export function getTxLink(signature: string) {
    return `https://explorer.solana.com/tx/${signature}`;
}

export function getAddressLink(address: string) {
    return `https://explorer.solana.com/address/${address}`;
}

export function getDexScreenerLink(tokenAddress: string) {
    return `https://dexscreener.com/solana/${tokenAddress}`;
}

export function getRaydiumLink(tokenAddress: string) {
    return `https://raydium.io/swap/?inputMint=${tokenAddress}&outputMint=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`;
}