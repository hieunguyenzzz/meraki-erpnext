import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "meraki-offline";
const DB_VERSION = 1;

const STORES = {
  leads: "leads",
  weddings: "weddings",
  communications: "communications",
  pendingActions: "pending-actions",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

interface PendingAction {
  id?: number;
  type: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  payload?: unknown;
  timestamp: number;
}

let db: IDBPDatabase | null = null;

export async function initOfflineDB(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Create object stores if they don't exist
      if (!database.objectStoreNames.contains(STORES.leads)) {
        database.createObjectStore(STORES.leads, { keyPath: "name" });
      }
      if (!database.objectStoreNames.contains(STORES.weddings)) {
        database.createObjectStore(STORES.weddings, { keyPath: "name" });
      }
      if (!database.objectStoreNames.contains(STORES.communications)) {
        database.createObjectStore(STORES.communications, { keyPath: "name" });
      }
      if (!database.objectStoreNames.contains(STORES.pendingActions)) {
        database.createObjectStore(STORES.pendingActions, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });

  return db;
}

export async function cacheData<T extends { name: string }>(
  store: StoreName,
  data: T[]
): Promise<void> {
  const database = await initOfflineDB();
  const tx = database.transaction(store, "readwrite");
  await Promise.all([
    ...data.map((item) => tx.store.put(item)),
    tx.done,
  ]);
}

export async function getCachedData<T>(store: StoreName): Promise<T[]> {
  const database = await initOfflineDB();
  return database.getAll(store) as Promise<T[]>;
}

export async function getCachedItem<T>(
  store: StoreName,
  key: string
): Promise<T | undefined> {
  const database = await initOfflineDB();
  return database.get(store, key) as Promise<T | undefined>;
}

export async function deleteCachedItem(
  store: StoreName,
  key: string
): Promise<void> {
  const database = await initOfflineDB();
  await database.delete(store, key);
}

export async function clearCache(store: StoreName): Promise<void> {
  const database = await initOfflineDB();
  await database.clear(store);
}

// Pending actions for offline sync
export async function addPendingAction(
  action: Omit<PendingAction, "id" | "timestamp">
): Promise<number> {
  const database = await initOfflineDB();
  return database.add(STORES.pendingActions, {
    ...action,
    timestamp: Date.now(),
  }) as Promise<number>;
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const database = await initOfflineDB();
  return database.getAll(STORES.pendingActions);
}

export async function getPendingActionsCount(): Promise<number> {
  const database = await initOfflineDB();
  return database.count(STORES.pendingActions);
}

export async function deletePendingAction(id: number): Promise<void> {
  const database = await initOfflineDB();
  await database.delete(STORES.pendingActions, id);
}

export async function syncPendingActions(): Promise<{
  synced: number;
  failed: number;
}> {
  const actions = await getPendingActions();
  let synced = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: {
          "Content-Type": "application/json",
          ...action.headers,
        },
        body: action.payload ? JSON.stringify(action.payload) : undefined,
      });

      if (response.ok && action.id) {
        await deletePendingAction(action.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
      console.error("Sync failed for action:", action.id);
    }
  }

  return { synced, failed };
}

// Hook for using offline cache with React Query
export function createOfflineQueryOptions<T extends { name: string }>(
  store: StoreName,
  fetchFn: () => Promise<T[]>
) {
  return {
    queryFn: async () => {
      try {
        // Try to fetch from network
        const data = await fetchFn();
        // Cache the result
        await cacheData(store, data);
        return data;
      } catch {
        // If network fails, return cached data
        const cached = await getCachedData<T>(store);
        if (cached.length > 0) {
          return cached;
        }
        throw new Error("No cached data available");
      }
    },
  };
}
