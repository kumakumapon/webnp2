// IndexedDB ラッパ (外部ライブラリ不使用、Promiseベース)。
// ディスクイメージの永続化に使う。

export interface StoredImage {
  sourceKey: string;
  url?: string;
  /** 元のファイル名(拡張子含む)。イメージ種別の判定とエクスポート時のファイル名に使う。リネームしても変わらない。 */
  name: string;
  bytes: ArrayBuffer;
  savedAt: number;
  /** 最後に起動またはマウントした時刻。未使用の既存イメージにはない。 */
  lastUsedAt?: number;
  /** ライブラリ一覧での表示名。未設定なら name をそのまま表示する。 */
  displayName?: string;
  /** 同一アーカイブから展開した複数ディスクをまとめるグループID。単体イメージでは未設定。 */
  group?: string;
  /** グループの表示名。同一グループの全レコードが同じ値を持つ(リネーム時は全件更新)。 */
  groupName?: string;
  /** グループ内の並び順(アーカイブ内の出現順)。 */
  groupIndex?: number;
}

/** 表示名/グループ情報など、UI側で付けたメタ情報のみを抜き出した型。 */
export type ImageMeta = Pick<StoredImage, 'displayName' | 'group' | 'groupName' | 'groupIndex'>;

const DB_NAME = 'webnp2';
const DB_VERSION = 1;
const STORE_NAME = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sourceKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('failed to open IndexedDB'));
  });
  return dbPromise;
}

export async function get(sourceKey: string): Promise<StoredImage | undefined> {
  const db = await openDb();
  return new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(sourceKey);
    req.onsuccess = () => resolve((req.result as StoredImage | undefined) ?? undefined);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
  });
}

export async function put(image: StoredImage): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(image);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('failed to write to IndexedDB'));
  });
}

/**
 * イメージ本体を書き戻す。表示名/グループ等のメタ情報は既存レコードのものを常に優先する。
 * put() は1レコード全置換のため、ゲスト側の書き込み保存や同じファイルの再取り込みで
 * ユーザーが付けた名前が消えるのを防ぐ用途で使う。
 */
export async function putPreservingMeta(image: StoredImage): Promise<void> {
  await updateImage(image.sourceKey, (existing) => {
    if (!existing) return image;
    const hasMeta =
      existing.displayName !== undefined ||
      existing.group !== undefined ||
      existing.groupName !== undefined ||
      existing.groupIndex !== undefined;
    return {
      ...image,
      savedAt: Math.max(image.savedAt, existing.savedAt + 1),
      lastUsedAt: Math.max(existing.lastUsedAt ?? 0, image.lastUsedAt ?? 0) || undefined,
      displayName: hasMeta ? existing.displayName : image.displayName,
      group: hasMeta ? existing.group : image.group,
      groupName: hasMeta ? existing.groupName : image.groupName,
      groupIndex: hasMeta ? existing.groupIndex : image.groupIndex,
    };
  });
}

async function updateImage(
  sourceKey: string,
  update: (image: StoredImage | undefined) => StoredImage | undefined,
): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(sourceKey);
    request.onsuccess = () => {
      const image = update(request.result as StoredImage | undefined);
      if (image) store.put(image);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('failed to update image'));
  });
}

/** 既存レコードのメタ情報(表示名/グループ)だけを更新する。イメージ本体は書き換えない。 */
export async function updateMeta(sourceKey: string, meta: ImageMeta): Promise<void> {
  await updateImage(sourceKey, (existing) => existing && { ...existing, ...meta });
}

/** 利用時刻だけを記録する。更新時刻やイメージの内容は維持する。 */
export async function markUsed(sourceKey: string, time: number): Promise<void> {
  await updateImage(sourceKey, (image) =>
    image && time > (image.lastUsedAt ?? 0) ? { ...image, lastUsedAt: time } : undefined);
}

/** Keep concurrent metadata changes and reject writes based on a removed or newer image. */
export async function replaceImageBytes(source: StoredImage, bytes: ArrayBuffer): Promise<void> {
  let replaced = false;
  await updateImage(source.sourceKey, (image) => {
    if (!image || image.savedAt !== source.savedAt) return undefined;
    replaced = true;
    return { ...image, bytes, savedAt: Math.max(Date.now(), image.savedAt + 1) };
  });
  if (!replaced) throw new Error(`Disk image changed during the operation: ${source.name}`);
}

/** 指定したイメージをまとめて取り出す。どれか1件でも使用中なら削除全体を取り消す。 */
export async function takeImages(
  sourceKeys: readonly string[],
  isActive: (sourceKey: string) => boolean,
): Promise<StoredImage[] | null> {
  const db = await openDb();
  return new Promise<StoredImage[] | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const images: StoredImage[] = [];
    let active = false;
    for (const key of new Set(sourceKeys)) {
      const request = store.get(key);
      request.onsuccess = () => {
        const image = request.result as StoredImage | undefined;
        if (!image) return;
        if (isActive(key)) {
          active = true;
          tx.abort();
          return;
        }
        images.push(image);
        store.delete(key);
      };
    }
    tx.oncomplete = () => resolve(images);
    tx.onabort = () => {
      if (active) resolve(null);
      else reject(tx.error ?? new Error('failed to delete images'));
    };
  });
}

/** Undo で同じキーが再登録されていた場合は、既存の内容を上書きせず全体を取り消す。 */
export async function restoreImages(images: readonly StoredImage[]): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const image of images) store.add(image);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('failed to restore images'));
  });
}

/** sourceKey が prefix で始まる全レコードを取得する。 */
export async function getAllByPrefix(prefix: string): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const req = store.getAll(range);
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
  });
}

/** store内の全レコードを取得する。 */
export async function getAllStored(): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('failed to read from IndexedDB'));
  });
}

export async function del(sourceKey: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(sourceKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('failed to delete from IndexedDB'));
  });
}

// `delete` は予約語のため関数名としては `del` を使い、
// 呼び出し側からは `delete` という名前でも import できるようにエイリアスする。
export { del as delete };
