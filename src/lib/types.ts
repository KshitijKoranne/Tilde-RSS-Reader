export interface Feed {
  id: string
  /** The feed document itself (RSS/Atom XML), not the site's home page. */
  url: string
  siteUrl: string
  title: string
  addedAt: number
  /** The group it sits under in the rail; empty means top level. Groups exist
   *  only as this string — there is no separate record to keep in step. */
  group: string
  lastFetchedAt: number
  /** Last fetch failure, cleared on the next success. */
  lastError: string
}

export interface Article {
  id: string
  /** A small number standing in for this article in the search index, where a
   *  full id would be repeated in every term it matches. Assigned once. */
  seq: number
  feedId: string
  feedTitle: string
  /** Feed-provided identity, used to recognise an entry across refreshes. */
  guid: string
  title: string
  link: string
  author: string
  publishedAt: number
  excerpt: string
  /* The body itself is deliberately not here. Article records are held in
   * memory all at once, so anything on them is paid for by every article ever
   * stored; the text lives in its own table and is read when it is opened.
   * This is the length of that text, which is all the list needs to know. */
  bodyChars: number
  read: boolean
  starred: boolean
  fetchedAt: number
}

/** An article's text, kept apart from the record so the list stays light. */
export interface ArticleBody {
  id: string
  /** Sanitised HTML, as stored. The reader sanitises again at render time. */
  html: string
  /** Plain text of html — what search matches and the index is built from. */
  text: string
}

export type ReaderFont = 'Archivo' | 'Newsreader' | 'Plex Mono'
export type ReaderSize = 'Small' | 'Regular' | 'Large'
export type ListDensity = 'Comfortable' | 'Compact'
export type Retention = 'Keep everything' | '1 year' | '6 months' | '3 months'

export const RETENTION_DAYS: Record<Retention, number> = {
  'Keep everything': 0,
  '1 year': 365,
  '6 months': 182,
  '3 months': 91,
}

export interface Settings {
  font: ReaderFont
  size: ReaderSize
  density: ListDensity
  showKeyboardHints: boolean
  markReadOnScroll: boolean
  loadImages: boolean
  keepArchive: boolean
  /** How long a read article's text is kept. Saved articles are never dropped. */
  retention: Retention
  /** Groups the reader has folded shut in the rail. */
  collapsedGroups: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  font: 'Newsreader',
  size: 'Regular',
  density: 'Comfortable',
  showKeyboardHints: true,
  markReadOnScroll: true,
  loadImages: false,
  keepArchive: true,
  retention: 'Keep everything',
  collapsedGroups: [],
}

/** 'welcome' is the first-run source picker; it is not a rail destination. */
export type View = 'welcome' | 'inbox' | 'saved' | 'search' | 'settings'
