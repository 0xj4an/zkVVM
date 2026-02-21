import { CompiledCircuit } from '@noir-lang/types';

/** Load pre-compiled circuit artifact from public/noir/. Circuits must be compiled offline with `nargo compile`. */
async function loadCircuit(path: string): Promise<CompiledCircuit> {
  const res = await window.fetch(path);
  if (!res.ok) throw new Error(`Failed to load circuit ${path}: ${res.status}`);
  return (await res.json()) as CompiledCircuit;
}

export async function getCircuit(): Promise<CompiledCircuit> {
  return loadCircuit('/noir/noirstarter.json');
}

/** Pre-compiled note_generator circuit: (value, pk_b, random) -> (nullifier, commitment, entry, root). */
export async function getNoteGeneratorCircuit(): Promise<CompiledCircuit> {
  return loadCircuit('/noir/note_generator.json');
}
