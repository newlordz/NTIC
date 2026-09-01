import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

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

  private async optimizeImageIfNeeded(file: File): Promise<{ blob: Blob; size: number; mimeType: string }> {
    if (!file.type || !file.type.startsWith('image/') || file.type.includes('svg')) {
      return { blob: file, size: file.size, mimeType: file.type || 'application/octet-stream' };
    }

    // Small files under 150KB don't need downscaling
    if (file.size <= 150 * 1024) {
      return { blob: file, size: file.size, mimeType: file.type };
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, size: file.size, mimeType: file.type });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve({ blob, size: blob.size, mimeType: 'image/jpeg' });
            } else {
              resolve({ blob: file, size: file.size, mimeType: file.type });
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ blob: file, size: file.size, mimeType: file.type });
      };
      img.src = url;
    });
  }

  async store(id: string, file: File): Promise<string> {
    const { blob, size, mimeType } = await this.optimizeImageIfNeeded(file);
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob, name: file.name, type: mimeType, size, uploadedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Optimistic non-blocking background server sync: returns ID immediately for instant UI preview!
    this.uploadToServer(id, file.name, mimeType, size, blob).catch(() => {});

    return id;
  }

  private async uploadToServer(id: string, fileName: string, mimeType: string, size: number, blob: Blob): Promise<void> {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const dataUrl = await base64Promise;

      const apiUrl = (environment.apiUrl || '/api').replace(/\/+$/, '');
      await fetch(`${apiUrl}/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: id,
          name: fileName || 'file',
          mime_type: mimeType || 'image/jpeg',
          size: size || 0,
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
      const apiUrl = (environment.apiUrl || '/api').replace(/\/+$/, '');
      const res = await fetch(`${apiUrl}/files/${encodeURIComponent(id)}`);
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
    return null;
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
