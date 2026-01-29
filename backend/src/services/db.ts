import fs from 'fs';
import path from 'path';
import { Database, Brand, Artifact, ResaleProof, EventLog } from '../types';

const DB_PATH = process.env.DB_PATH || './data/db.json';

const DEFAULT_DB: Database = {
  brands: {},
  artifacts: {},
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

  setArtifact(artifact: Artifact): void {
    this.data.artifacts[artifact.tagHash] = artifact;
    this.save();
  }

  getArtifactsByBrand(brandAddress: string): Artifact[] {
    return Object.values(this.data.artifacts).filter(
      a => a.brandAddress === brandAddress
    );
  }

  getArtifactsByOwner(ownerAddress: string): Artifact[] {
    return Object.values(this.data.artifacts).filter(
      a => a.ownerAddress === ownerAddress
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
}
