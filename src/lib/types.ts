export interface Feed {
  id: string
  /** The feed document itself (RSS/Atom XML), not the site's home page. */
  url: string
  siteUrl: string
  title: string
  addedAt: number
  lastFetchedAt: number
  /** Last fetch failure, cleared on the next success. */
  lastError: string
}

export interface Article {
  id: string
  feedId: string
  feedTitle: string
  /** Feed-provided identity, used to recognise an entry across refreshes. */
  guid: string
  title: string
  link: string
  author: string
  publishedAt: number
  excerpt: string
  /** Sanitised HTML. Empty when the local archive is switched off. */
  contentHtml: string
  /** Plain text of contentHtml. Search reads this, never the markup. */
  contentText: string
  read: boolean
  starred: boolean
  fetchedAt: number
}

export type ReaderFont = 'Archivo' | 'Newsreader' | 'Plex Mono'
export type ReaderSize = 'Small' | 'Regular' | 'Large'
export type ListDensity = 'Comfortable' | 'Compact'

export interface Settings {
  font: ReaderFont
  size: ReaderSize
  density: ListDensity
  showKeyboardHints: boolean
  markReadOnScroll: boolean
  loadImages: boolean
  keepArchive: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  font: 'Newsreader',
  size: 'Regular',
  density: 'Comfortable',
  showKeyboardHints: true,
  markReadOnScroll: true,
  loadImages: false,
  keepArchive: true,
}

/** 'welcome' is the first-run source picker; it is not a rail destination. */
export type View = 'welcome' | 'inbox' | 'saved' | 'search' | 'settings'
