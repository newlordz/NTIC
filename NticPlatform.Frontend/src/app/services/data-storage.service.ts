import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DataStorageService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'ntic-data';
  private readonly storeName = 'kv';
  private readonly version = 1;

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async migrateFromLocalStorage<T>(lsKey: string, idbKey: string, defaultValue: T): Promise<T> {
    const existing = await this.get<T>(idbKey);
    if (existing !== null) return existing;

    const lsRaw = localStorage.getItem(lsKey);
    if (lsRaw) {
      try {
        const parsed = JSON.parse(lsRaw) as T;
        await this.set(idbKey, parsed);
        localStorage.removeItem(lsKey);
        return parsed;
      } catch { /* corrupt, fall through */ }
    }

    await this.set(idbKey, defaultValue);
    return JSON.parse(JSON.stringify(defaultValue));
  }
}
