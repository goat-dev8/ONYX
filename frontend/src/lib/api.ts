const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function getAuthToken(): string | null {
  return localStorage.getItem('onyx_token');
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  async getNonce(address: string) {
    const response = await fetch(`${API_BASE_URL}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return handleResponse<{ nonce: string; message: string; timestamp: number }>(response);
  },

  async verifySignature(address: string, signature: string, nonce: string) {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signature, nonce }),
    });
    return handleResponse<{
      success: boolean;
      token: string;
      address: string;
      role: string;
      brand: { displayName: string } | null;
    }>(response);
  },

  async registerBrand(displayName: string) {
    const response = await fetch(`${API_BASE_URL}/brands/register`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ displayName }),
    });
    return handleResponse<{ success: boolean; brand: { address: string; displayName: string } }>(response);
  },

  async getMyBrand() {
    const response = await fetch(`${API_BASE_URL}/brands/me`, {
      headers: authHeaders(),
    });
    return handleResponse<{
      brand: { address: string; displayName: string };
      stats: { totalArtifacts: number; stolenCount: number };
    }>(response);
  },

  async mintArtifact(data: {
    tagHash: string;
    modelId: number;
    serialHash: string;
    initialOwner: string;
    txId: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/artifacts/mint`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; artifact: Record<string, unknown> }>(response);
  },

  async transferArtifact(data: { tagHash: string; to: string; txId: string }) {
    const response = await fetch(`${API_BASE_URL}/artifacts/transfer`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; artifact: Record<string, unknown> }>(response);
  },

  async reportStolen(data: { tagHash: string; txId: string }) {
    const response = await fetch(`${API_BASE_URL}/artifacts/stolen`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<{ success: boolean; stolen: boolean; tagHash: string }>(response);
  },

  async checkStolenStatus(tagHash: string) {
    const response = await fetch(`${API_BASE_URL}/artifacts/stolen/check/${encodeURIComponent(tagHash)}`);
    return handleResponse<{ stolen: boolean; tagHash: string; reportedAt?: string; txId?: string }>(response);
  },

  async getMyArtifacts() {
    const response = await fetch(`${API_BASE_URL}/artifacts/mine`, {
      headers: authHeaders(),
    });
    return handleResponse<{ artifacts: Record<string, unknown>[]; count: number }>(response);
  },

  async verifyArtifact(tagHash: string) {
    const response = await fetch(`${API_BASE_URL}/artifacts/${encodeURIComponent(tagHash)}`);
    return handleResponse<{
      status: 'authentic' | 'stolen' | 'unknown';
      authentic: boolean;
      stolen: boolean;
      brandAddress?: string;
      modelId?: number;
      mintedAt?: string;
      message: string;
    }>(response);
  },

  async submitProof(data: { tagHash: string; token: string; txId: string }) {
    const response = await fetch(`${API_BASE_URL}/verify/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{
      valid: boolean;
      reason?: string;
      artifact?: Record<string, unknown>;
    }>(response);
  },

  async health() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return handleResponse<{ status: string; timestamp: string }>(response);
  },

  async verifyProof(token: string) {
    const response = await fetch(`${API_BASE_URL}/verify/token/${encodeURIComponent(token)}`);
    return handleResponse<{
      valid: boolean;
      artifact?: {
        tagHash: string;
        modelId: number;
        brandAddress: string;
      };
      error?: string;
    }>(response);
  },
};
