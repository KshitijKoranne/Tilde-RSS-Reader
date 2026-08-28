/* Feeds Tilde offers on an empty install.
 *
 * Nothing here is subscribed automatically — the point of the app is that you
 * pick your own sources. These are a starting point for people who have not
 * used a reader before, grouped so the list is scannable. Every URL was
 * checked live; they are widely-read publications, not personal favourites
 * dressed up as defaults.
 */

export interface SuggestedFeed {
  title: string
  url: string
  note: string
}

export interface SuggestedGroup {
  name: string
  feeds: SuggestedFeed[]
}

export const SUGGESTED_GROUPS: SuggestedGroup[] = [
  {
    name: 'News',
    feeds: [
      { title: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', note: 'World headlines' },
      { title: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', note: 'US and world news' },
      { title: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', note: 'Global coverage' },
    ],
  },
  {
    name: 'Technology',
    feeds: [
      { title: 'Hacker News', url: 'https://news.ycombinator.com/rss', note: 'The front page' },
      { title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', note: 'Tech news and analysis' },
      { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', note: 'Tech and culture' },
      { title: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', note: 'What is coming next' },
    ],
  },
  {
    name: 'Science',
    feeds: [
      { title: 'Quanta Magazine', url: 'https://api.quantamagazine.org/feed/', note: 'Maths and physics, explained well' },
      { title: 'Nature', url: 'https://www.nature.com/nature.rss', note: 'New research' },
      { title: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', note: 'Space, from the source' },
    ],
  },
  {
    name: 'Programming',
    feeds: [
      { title: 'Julia Evans', url: 'https://jvns.ca/atom.xml', note: 'How things actually work' },
      { title: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', note: 'Daily notes on AI and code' },
      { title: 'Ink & Switch', url: 'https://www.inkandswitch.com/index.xml', note: 'Research on better software' },
      { title: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', note: 'Front-end and design' },
    ],
  },
  {
    name: 'Writing & culture',
    feeds: [
      { title: 'kottke.org', url: 'https://feeds.kottke.org/main', note: 'Links worth keeping since 1998' },
      { title: 'Craig Mod', url: 'https://craigmod.com/index.xml', note: 'Walking, books, photography' },
      { title: 'Robin Sloan', url: 'https://www.robinsloan.com/feed.xml', note: 'Novelist, on the internet' },
      { title: 'The Whippet', url: 'https://thewhippet.org/rss/', note: 'Curious things, occasionally' },
    ],
  },
]

export const SUGGESTED_COUNT = SUGGESTED_GROUPS.reduce((n, g) => n + g.feeds.length, 0)
