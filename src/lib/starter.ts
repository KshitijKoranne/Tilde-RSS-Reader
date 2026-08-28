/* Sources a new install begins with — the six from the design file, all
 * verified live. They are ordinary subscriptions: removable in Settings, and
 * seeded only once, so removing one does not bring it back. */

export interface StarterFeed {
  title: string
  url: string
}

export const STARTER_FEEDS: StarterFeed[] = [
  { title: 'Craig Mod', url: 'https://craigmod.com/index.xml' },
  { title: 'Robin Sloan', url: 'https://www.robinsloan.com/feed.xml' },
  { title: 'Ink & Switch', url: 'https://www.inkandswitch.com/index.xml' },
  // Their advertised /index.xml is a section index with empty titles; rss.xml
  // is the one that actually carries articles.
  { title: 'Low-tech Magazine', url: 'https://solar.lowtechmagazine.com/rss.xml' },
  { title: 'Julia Evans', url: 'https://jvns.ca/atom.xml' },
  { title: 'The Whippet', url: 'https://thewhippet.org/rss/' },
]

export const SEEDED_FLAG = 'seeded'
