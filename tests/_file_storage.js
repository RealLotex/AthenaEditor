export function fileStorage() {
  const data = new Map();
  let closes = 0;
  const db = {
    createObjectStore() {},
    close: () => {
      closes++;
    },
    transaction() {
      const tx = {};
      const result = (value) => {
        queueMicrotask(() => tx.oncomplete());
        return { result: value };
      };
      tx.objectStore = () => ({
        put(value, key) {
          data.set(key, value);
          return result(key);
        },
        get: (key) => result(data.get(key)),
        delete(key) {
          data.delete(key);
          return result(undefined);
        },
      });
      return tx;
    },
  };
  return {
    data,
    get closes() {
      return closes;
    },
    indexedDB: {
      open() {
        const req = { result: db };
        queueMicrotask(() => {
          req.onupgradeneeded();
          req.onsuccess();
        });
        return req;
      },
    },
  };
}
