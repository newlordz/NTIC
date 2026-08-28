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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob: file, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Also sync to server-side Postgres storage asynchronously
    this.uploadToServer(id, file).catch(() => {});

    return id;
  }

  private async uploadToServer(id: string, file: File): Promise<void> {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataUrl = await base64Promise;

      await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: id,
          name: file.name || 'file',
          mime_type: file.type || 'image/png',
          size: file.size || 0,
          data_base64: dataUrl
        })
      });
    } catch (_) {}
  }

  async get(id: string): Promise<{ blob: Blob; metadata: StoredFile } | null> {
    if (!id) return null;
    const db = await this.openDb();
    const local = await new Promise<any>((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });

    if (local && local.blob) {
      return { blob: local.blob, metadata: { id, name: local.name, type: local.type, size: local.size, uploadedAt: local.uploadedAt } };
    }

    // Fallback: fetch from server
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
      if (res.ok) {
        const blob = await res.blob();
        const metadata: StoredFile = {
          id,
          name: id,
          type: blob.type || 'image/png',
          size: blob.size,
          uploadedAt: new Date().toISOString()
        };
        // Cache in IndexedDB for subsequent reads
        try {
          const tx = db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.put({ id, blob, name: id, type: blob.type, size: blob.size, uploadedAt: metadata.uploadedAt });
        } catch (_) {}
        return { blob, metadata };
      }
    } catch (_) {}

    return null;
  }

  async getUrl(id: string): Promise<string | null> {
    if (!id) return null;
    if (id.startsWith('http://') || id.startsWith('https://') || id.startsWith('blob:') || id.startsWith('data:')) {
      return id;
    }
    const file = await this.get(id);
    if (file && file.blob) {
      return URL.createObjectURL(file.blob);
    }
    return `/api/files/${encodeURIComponent(id)}`;
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
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  generateId(): string {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }
}
