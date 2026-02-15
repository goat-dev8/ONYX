const PROVABLE_API_BASE = process.env.PROVABLE_API_BASE || 'https://api.explorer.provable.com/v1/testnet';

export interface TransactionResult {
  found: boolean;
  accepted: boolean;
  txId: string;
  blockHeight?: number;
  programId?: string;
  functionName?: string;
}

export async function getTransaction(txId: string): Promise<TransactionResult> {
  try {
    const normalizedTxId = txId.toLowerCase();
    
    const response = await fetch(`${PROVABLE_API_BASE}/transaction/${normalizedTxId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { found: false, accepted: false, txId };
      }
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;

    const isAccepted = data.status === 'accepted' || 
                       data.type === 'execute' ||
                       !!data.execution;

    const execution = data.execution as Record<string, unknown> | undefined;
    const transitions = execution?.transitions as Array<Record<string, unknown>> | undefined;
    const indexData = data.index as Record<string, unknown> | undefined;

    return {
      found: true,
      accepted: isAccepted,
      txId: normalizedTxId,
      blockHeight: (data.block_height || indexData?.block_height) as number | undefined,
      programId: transitions?.[0]?.program as string | undefined,
      functionName: transitions?.[0]?.function as string | undefined
    };
  } catch (err) {
    console.error('[ProvableAPI] Error fetching transaction:', err);
    return { found: false, accepted: false, txId };
  }
}

export async function verifyTransactionAccepted(txId: string): Promise<boolean> {
  const result = await getTransaction(txId);
  return result.found && result.accepted;
}

export async function getMappingValue(
  programId: string,
  mappingName: string,
  key: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${PROVABLE_API_BASE}/program/${programId}/mapping/${mappingName}/${key}`
    );
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    return (data.value || data) as string;
  } catch (err) {
    console.error('[ProvableAPI] Error fetching mapping:', err);
    return null;
  }
}

// Check if a brand is authorized on the current contract version
export async function isBrandAuthorized(
  programId: string,
  brandAddress: string
): Promise<boolean> {
  try {
    // v3 uses registered_brands, v2 uses authorized_brands
    const mappingNames = ['registered_brands', 'authorized_brands'];
    for (const mappingName of mappingNames) {
      const value = await getMappingValue(programId, mappingName, brandAddress);
      if (value && String(value).includes('true')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
