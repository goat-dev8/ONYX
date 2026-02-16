import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Database, Brand, Artifact, ResaleProof, EventLog, Listing } from '../types';

const DB_PATH = process.env.DB_PATH || './data/db.json';

const DEFAULT_DB: Database = {
  brands: {},
  artifacts: {},
  listings: {},
  proofs: [],
  nonces: {},
  events: [],
  stolenTags: {}
};

class WriteQueue {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;

  async add(operation: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await operation();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const op = this.queue.shift();
      if (op) await op();
    }

    this.processing = false;
  }
}

export class DatabaseService {
  private static instance: DatabaseService;
  private data: Database;
  private writeQueue: WriteQueue;

  private constructor() {
    this.writeQueue = new WriteQueue();
    this.data = this.load();
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private load(): Database {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return { ...DEFAULT_DB, ...JSON.parse(raw) };
      }

      this.saveSync(DEFAULT_DB);
      return DEFAULT_DB;
    } catch (err) {
      console.error('[DB] Failed to load database:', err);
      return DEFAULT_DB;
    }
  }

  private saveSync(data: Database): void {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, DB_PATH);
    } catch (err) {
      console.error('[DB] Failed to save database:', err);
    }
  }

  private async save(): Promise<void> {
    await this.writeQueue.add(async () => {
      this.saveSync(this.data);
    });
  }

  getNonce(address: string): string | null {
    return this.data.nonces[address] || null;
  }

  setNonce(address: string, nonce: string): void {
    this.data.nonces[address] = nonce;
    this.save();
  }

  clearNonce(address: string): void {
    delete this.data.nonces[address];
    this.save();
  }

  getBrand(address: string): Brand | null {
    return this.data.brands[address] || null;
  }

  setBrand(brand: Brand): void {
    this.data.brands[brand.address] = brand;
    this.save();
  }

  getAllBrands(): Brand[] {
    return Object.values(this.data.brands);
  }

  getArtifact(tagHash: string): Artifact | null {
    return this.data.artifacts[tagHash] || null;
  }

  getAllArtifacts(): Artifact[] {
    return Object.values(this.data.artifacts);
  }

  setArtifact(artifact: Artifact): void {
    this.data.artifacts[artifact.tagHash] = artifact;
    this.save();
  }

  getArtifactsByBrand(brandAddress: string): Artifact[] {
    return Object.values(this.data.artifacts).filter(
      a => a.brandAddress === brandAddress
    );
  }

  private hashAddress(address: string): string {
    return crypto.createHash('sha256').update(address).digest('hex');
  }

  getArtifactsByOwner(ownerAddress: string): Artifact[] {
    const hash = this.hashAddress(ownerAddress);
    return Object.values(this.data.artifacts).filter(
      a => a.ownerHash === hash
    );
  }

  addProof(proof: ResaleProof): void {
    this.data.proofs.push(proof);
    this.save();
  }

  getProofByToken(token: string): ResaleProof | null {
    return this.data.proofs.find(p => p.token === token) || null;
  }

  addEvent(event: EventLog): void {
    this.data.events.push(event);
    this.save();
  }

  getEvents(limit = 100): EventLog[] {
    return this.data.events.slice(-limit);
  }

  // Stolen tags registry
  markTagStolen(tagHash: string, txId: string, reportedBy: string): void {
    this.data.stolenTags[tagHash] = {
      tagHash,
      reportedAt: new Date().toISOString(),
      txId,
      reportedBy,
    };
    this.save();
  }

  isTagStolen(tagHash: string): boolean {
    return !!this.data.stolenTags[tagHash];
  }

  getStolenTagInfo(tagHash: string): { tagHash: string; reportedAt: string; txId: string; reportedBy: string } | null {
    return this.data.stolenTags[tagHash] || null;
  }

  // ========== Listings ==========

  getListing(id: string): Listing | null {
    return this.data.listings[id] || null;
  }

  setListing(listing: Listing): void {
    this.data.listings[listing.id] = listing;
    this.save();
  }

  deleteListing(id: string): void {
    delete this.data.listings[id];
    this.save();
  }

  getListingByCommitment(tagCommitment: string): Listing | null {
    return Object.values(this.data.listings).find(
      l => l.tagCommitment === tagCommitment && l.status !== 'delisted'
    ) || null;
  }

  getListingByTagHash(tagHash: string): Listing | null {
    return Object.values(this.data.listings).find(
      l => l.tagHash === tagHash && (l.status === 'active' || l.status === 'reserved')
    ) || null;
  }

  getListingsBySeller(sellerHash: string): Listing[] {
    return Object.values(this.data.listings).filter(
      l => l.sellerHash === sellerHash
    );
  }

  getAllListings(filters?: {
    brand?: string;
    modelId?: number;
    currency?: 'aleo' | 'usdcx';
    minPrice?: number;
    maxPrice?: number;
    condition?: string[];
    status?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): { listings: Listing[]; total: number; page: number; totalPages: number } {
    let results = Object.values(this.data.listings);

    // Default to active only
    const statusFilter = filters?.status || 'active';
    if (statusFilter !== 'all') {
      results = results.filter(l => l.status === statusFilter);
    }

    // Filter by brand name (case-insensitive partial match)
    if (filters?.brand) {
      const brandLower = filters.brand.toLowerCase();
      results = results.filter(l => l.brandName.toLowerCase().includes(brandLower));
    }

    // Filter by model
    if (filters?.modelId) {
      results = results.filter(l => l.modelId === filters.modelId);
    }

    // Filter by currency
    if (filters?.currency) {
      results = results.filter(l => l.currency === filters.currency);
    }

    // Filter by price range
    if (filters?.minPrice !== undefined) {
      results = results.filter(l => l.price >= filters.minPrice!);
    }
    if (filters?.maxPrice !== undefined) {
      results = results.filter(l => l.price <= filters.maxPrice!);
    }

    // Filter by condition
    if (filters?.condition && filters.condition.length > 0) {
      results = results.filter(l => filters.condition!.includes(l.condition));
    }

    // Sort
    switch (filters?.sort) {
      case 'price_asc':
        results.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        results.sort((a, b) => b.price - a.price);
        break;
      case 'oldest':
        results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'newest':
      default:
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    const total = results.length;
    const limit = Math.min(filters?.limit || 20, 50);
    const page = filters?.page || 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;

    results = results.slice(offset, offset + limit);

    return { listings: results, total, page, totalPages };
  }
}
