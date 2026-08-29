/* jsdom ships no IndexedDB, so db.ts would have nothing to open. fake-indexeddb
 * is the reference implementation of the same spec, in memory. */
import 'fake-indexeddb/auto'
