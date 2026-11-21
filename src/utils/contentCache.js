/**
 * Read-only game content (WordCard, DrawWord, FrequencyTopic, SpyLocation),
 * loaded once and cached in memory and on the device. See contentCacheCore.js
 * for how freshness is checked. Use loadContent() instead of
 * getDocs(collection(db, '<content collection>')).
 *
 * To make devices refresh right after editing a list in the Firebase
 * console, keep a `_meta` doc in that collection with a numeric `version`
 * and bump it after each edit. (Loaders ignore `_meta`: it has none of the
 * content fields.)
 */
import { collection, doc, getCountFromServer, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import storage from './storage';
import { createContentCache } from './contentCacheCore';

const cache = createContentCache({
  fetchMeta: async (name) => {
    const snap = await getDoc(doc(db, name, '_meta'));
    return snap.exists() ? snap.data() : null;
  },
  fetchCount: async (name) => (await getCountFromServer(collection(db, name))).data().count,
  fetchAll: async (name) => {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  storage,
  log: (message) => console.log(message),
});

/** All docs of a content collection, as data objects with `id`. */
export const loadContent = (name) => cache.get(name);
