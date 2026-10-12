import { ImageProp } from "@/components/playground/image-item";

// The in-progress edit is kept in IndexedDB rather than cookies/local storage
// because the base photo is far larger than either of those can hold

export interface DraftState {
  images: ImageProp[],
  backgroundSrc: string,
  itemCount: number,
  exportName: string,
  watermarkChecked: boolean
}

export interface Draft {
  baseImage: Blob,
  state: DraftState | null
}

const DB_NAME = "deadpaw-draft";
const STORE_NAME = "draft";
const BASE_IMAGE_KEY = "baseImage";
const STATE_KEY = "state";

const openDB = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Run a set of operations in one transaction, resolve with their results once it's committed
const transact = async (mode: IDBTransactionMode, operations: (store: IDBObjectStore) => IDBRequest[]) => {
  const db = await openDB();
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const requests = operations(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(requests.map((request) => request.result));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

// Start a new draft from a base image
export const startDraft = async (baseImage: Blob) => {
  await transact("readwrite", (store) => [store.put(baseImage, BASE_IMAGE_KEY)]);
};

export const saveDraftState = async (state: DraftState) => {
  await transact("readwrite", (store) => [store.put(state, STATE_KEY)]);
};

export const loadDraft = async (): Promise<Draft | null> => {
  const [baseImage, state] = await transact("readonly", (store) => [store.get(BASE_IMAGE_KEY), store.get(STATE_KEY)]);
  if (!(baseImage instanceof Blob)) return null;
  return { baseImage, state: (state as DraftState | undefined) ?? null };
};

export const clearDraft = async () => {
  await transact("readwrite", (store) => [store.clear()]);
};
