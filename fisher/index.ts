import { execute, createSignerWithViem, type ISerializableSignedAction } from '@evvm/evvm-js';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import {
  createWalletClient,
  decodeAbiParameters,
  http,
  keccak256,
  stringToHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

const CORE_ABI_PATH = resolve(
  __dirname,
  '..',
  'packages',
  'artifacts',
  '@evvm',
  'testnet-contracts',
  'interfaces',
  'ICore.sol',
  'ICore.json'
);

const coreErrorSelectors = loadCoreErrorSelectors(CORE_ABI_PATH);

const PORT = Number(process.env.PORT || process.env.FISHER_PORT || '8787');
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

const baseSigner = await createSignerWithViem(walletClient as any);
const signer = Object.assign(baseSigner, {
  address: account.address,
  writeContract: async (params: {
    contractAddress: `0x${string}`;
    contractAbi: unknown;
    functionName: string;
    args: unknown[];
  }) => {
    return walletClient.writeContract({
      address: params.contractAddress,
      abi: params.contractAbi as any,
      functionName: params.functionName as any,
      args: params.args as any,
      account,
    });
  },
});

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS' && url.pathname === '/execute') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

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
        console.log({ body });

        if (!body.signedAction)
          return jsonResponse(400, { error: 'No signedAction present in body' });

        const txHash = await execute(signer, body.signedAction);
        console.log('SUCCESS');
        console.log({ txHash });
        return jsonResponse(200, { txHash });
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : String(error);
        const debug = buildRevertDebug(error, coreErrorSelectors);
        return jsonResponse(500, { error: message, debug });
      }
    }

    // Servir archivos estáticos del frontend
    if (req.method === 'GET') {
      const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const staticPath = resolve(__dirname, '..', 'packages', 'vite', 'dist', filePath);

      try {
        const file = Bun.file(staticPath);
        if (await file.exists()) {
          return new Response(file);
        }
      } catch (error) {
        console.error('Error serving static file:', error);
      }

      // Solo servir index.html como fallback para rutas de navegación (SPA routing)
      // NO para assets (.js, .css, .wasm, etc.)
      const isAsset = /\.(js|css|wasm|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(url.pathname);
      if (!isAsset) {
        try {
          const indexPath = resolve(__dirname, '..', 'packages', 'vite', 'dist', 'index.html');
          const indexFile = Bun.file(indexPath);
          if (await indexFile.exists()) {
            return new Response(indexFile, {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        } catch (error) {
          console.error('Error serving index.html:', error);
        }
      }
    }

    return jsonResponse(404, { error: 'Not found' });
  },
});

console.log(`Fisher running on http://localhost:${PORT}`);

function loadCoreErrorSelectors(coreAbiPath: string): Map<string, string> {
  try {
    if (!fs.existsSync(coreAbiPath)) return new Map();
    const raw = fs.readFileSync(coreAbiPath, 'utf8');
    const json = JSON.parse(raw || '{}');
    const abi = Array.isArray(json?.abi) ? json.abi : [];
    const selectors = new Map<string, string>();
    for (const item of abi) {
      if (!item || item.type !== 'error') continue;
      const name = item.name || 'UnknownError';
      const inputs = Array.isArray(item.inputs) ? item.inputs : [];
      const signature = `${name}(${inputs.map((input: any) => input.type).join(',')})`;
      const selector = keccak256(stringToHex(signature)).slice(0, 10);
      selectors.set(selector, signature);
    }
    return selectors;
  } catch (error) {
    console.warn('Failed to load Core ABI for error decoding', error);
    return new Map();
  }
}

function buildRevertDebug(
  error: unknown,
  selectorMap: Map<string, string>
): Record<string, unknown> | undefined {
  const { data, candidates } = extractRevertData(error);
  if (!data) return undefined;

  const outerSelector = data.slice(0, 10);
  const debug: Record<string, unknown> = {
    revertData: data,
    outerSelector,
  };

  if (
    outerSelector === '0xbc92d5bc' ||
    outerSelector === '0xe2bbc03d' ||
    outerSelector === '0x71d49912'
  ) {
    try {
      const decoded = decodeAbiParameters(
        [{ type: 'bytes' }],
        `0x${data.slice(10)}` as Hex
      );
      const innerData = decoded[0] as Hex;
      debug.innerReasonData = innerData;
      if (typeof innerData === 'string' && innerData.startsWith('0x')) {
        const innerSelector = innerData.slice(0, 10);
        debug.innerSelector = innerSelector;
        debug.innerSignature = selectorMap.get(innerSelector);
      }
    } catch (decodeError) {
      debug.decodeError = decodeError instanceof Error ? decodeError.message : String(decodeError);
    }
  } else {
    debug.outerSignature = selectorMap.get(outerSelector);
  }

  if (candidates.length > 1) {
    debug.hexCandidates = candidates.slice(0, 5);
  }

  return debug;
}

function extractRevertData(
  error: unknown
): { data?: Hex; candidates: Array<{ hex: Hex; length: number }> } {
  const visited = new Set<unknown>();
  const stack: unknown[] = [error];
  const candidates: Array<{ hex: Hex; length: number }> = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (typeof current === 'string') {
      const hexes = extractLikelyHexes(current);
      for (const hex of hexes) candidates.push({ hex, length: hex.length });
      continue;
    }

    if (typeof current !== 'object') continue;

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (typeof value === 'string') {
        const hexes = extractLikelyHexes(value);
        for (const hex of hexes) candidates.push({ hex, length: hex.length });
        continue;
      }
      if (typeof value === 'object' && value !== null) {
        stack.push(value);
      }
    }
  }

  if (candidates.length === 0) return { candidates };
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  const best = sorted[0];
  if (!best) return { candidates };
  return { data: best.hex, candidates: sorted };
}

function extractLikelyHexes(value: string): Hex[] {
  const matches = value.match(/0x[0-9a-fA-F]+/g);
  if (!matches) return [];
  const hexes: Hex[] = [];
  for (const candidate of matches) {
    if (candidate.length < 10) continue;
    if (candidate.length === 42) continue; // likely an address
    if ((candidate.length - 2) % 2 !== 0) continue;
    hexes.push(candidate as Hex);
  }
  return hexes;
}
