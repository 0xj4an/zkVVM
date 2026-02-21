import { execute, createSignerWithViem, type ISerializableSignedAction } from '@evvm/evvm-js';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PORT = Number(process.env.FISHER_PORT || '8787');
const RPC_URL = process.env.EVVM_SEPOLIA_RPC_URL || '';
const PRIVATE_KEY = process.env.FISHER_PRIVATE_KEY || '';
const CHAIN_ID = process.env.EVVM_SEPOLIA_CHAIN_ID
  ? Number(process.env.EVVM_SEPOLIA_CHAIN_ID)
  : 11155111;

if (!RPC_URL) throw new Error('EVVM_SEPOLIA_RPC_URL is required');
if (!PRIVATE_KEY) throw new Error('FISHER_PRIVATE_KEY is required');

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const chain = {
  id: CHAIN_ID,
  name: 'sepoliaEvvm',
  network: 'sepoliaEvvm',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
} as const;

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(RPC_URL),
});

const signer = await createSignerWithViem(walletClient as any);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/execute') {
      try {
        const text = await req.text();
        if (!text) return jsonResponse(400, { error: 'Empty body' });

        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }

        const body = payload as { signedAction: ISerializableSignedAction<any> };

        if (!body.signedAction)
          return jsonResponse(400, { error: 'No signedAction present in body' });

        const txHash = await execute(signer, body.signedAction);
        return jsonResponse(200, { txHash });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(500, { error: message });
      }
    }

    return jsonResponse(404, { error: 'Not found' });
  },
});

console.log(`Fisher running on http://localhost:${PORT}`);
