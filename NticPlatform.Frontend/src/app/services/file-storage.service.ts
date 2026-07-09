import { Injectable } from '@angular/core';

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

@Injectable({ providedIn: 'root' })
export class FileStorageService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'ntic-files';
  private readonly storeName = 'files';

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async store(id: string, file: File): Promise<string> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob: file, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async get(id: string): Promise<{ blob: Blob; metadata: StoredFile } | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) return resolve(null);
        const { blob, name, type, size, uploadedAt } = result;
        resolve({ blob, metadata: { id, name, type, size, uploadedAt } });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUrl(id: string): Promise<string | null> {
    const file = await this.get(id);
    if (!file) return null;
    return URL.createObjectURL(file.blob);
  }

  async remove(id: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  revokeUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  generateId(): string {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }
}
