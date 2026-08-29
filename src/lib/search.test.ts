import { describe, expect, it } from 'vitest'
import {
  addDoc,
  indexTerms,
  intersect,
  matchesPhrase,
  normalizeText,
  parseQuery,
  prefixRange,
  removeDocs,
  tokenize,
  union,
} from './search'

describe('normalizeText', () => {
  it('folds case and accents so cafe finds café', () => {
    expect(normalizeText('Café')).toBe('cafe')
    expect(normalizeText('CAFÉ')).toBe(normalizeText('cafe'))
  })

  it('leaves plain text alone but lowercased', () => {
    expect(normalizeText('The Long Now')).toBe('the long now')
  })
})

describe('tokenize', () => {
  it('splits on everything that is not a letter or a digit', () => {
    expect(tokenize("Rust's borrow-checker, v2.0")).toEqual(['rust', 's', 'borrow', 'checker', 'v2', '0'])
  })

  it('keeps words in scripts that are not Latin', () => {
    expect(tokenize('日本語 テスト')).toEqual(['日本語', 'テスト'])
  })

  it('returns nothing for punctuation alone', () => {
    expect(tokenize('—  …  !')).toEqual([])
  })
})

describe('indexTerms', () => {
  it('files each word once', () => {
    expect(indexTerms('the cat the cat').sort()).toEqual(['cat', 'the'])
  })

  it('drops single letters, which match nearly everything', () => {
    expect(indexTerms('a bee c')).toEqual(['bee'])
  })

  it('stops after the first stretch of a very long article', () => {
    const long = `${'lorem '.repeat(4000)}sentinel`
    expect(indexTerms(long)).not.toContain('sentinel')
    expect(indexTerms(long)).toContain('lorem')
  })
})

describe('parseQuery', () => {
  it('treats the word being typed as a prefix', () => {
    expect(parseQuery('compil')).toEqual({ terms: [], prefix: 'compil', phrase: '', empty: false })
  })

  it('treats a finished word as a whole term', () => {
    expect(parseQuery('compiler ')).toMatchObject({ terms: ['compiler'], prefix: '' })
  })

  it('keeps earlier words whole and only the last one open', () => {
    expect(parseQuery('rust compil')).toMatchObject({ terms: ['rust'], prefix: 'compil' })
  })

  it('asks for a phrase check once there is more than one word', () => {
    expect(parseQuery('the long now').phrase).toBe('the long now')
  })

  it('asks for no phrase check on a single word', () => {
    expect(parseQuery('compiler ').phrase).toBe('')
  })

  it('folds accents in the query the same way the index does', () => {
    expect(parseQuery('Café ')).toMatchObject({ terms: ['cafe'] })
  })

  it('reports an empty query', () => {
    expect(parseQuery('   ').empty).toBe(true)
    expect(parseQuery('a').empty).toBe(false)
  })
})

describe('prefixRange', () => {
  it('spans every term starting with the prefix', () => {
    const [low, high] = prefixRange('comp')
    expect('comp' >= low && 'comp' <= high).toBe(true)
    expect('compiler' >= low && 'compiler' <= high).toBe(true)
    expect('conquer' <= high).toBe(false)
    expect('com' >= low).toBe(false)
  })
})

describe('postings lists', () => {
  it('inserts in order', () => {
    expect([5, 1, 3].reduce(addDoc, [] as number[])).toEqual([1, 3, 5])
  })

  it('never stores the same article twice', () => {
    expect(addDoc([1, 2, 3], 2)).toEqual([1, 2, 3])
  })

  it('returns the same list when there is nothing to add', () => {
    const docs = [1, 2, 3]
    expect(addDoc(docs, 2)).toBe(docs)
  })

  it('removes a whole set at once', () => {
    expect(removeDocs([1, 2, 3, 4], new Set([2, 4]))).toEqual([1, 3])
  })

  it('intersects two sorted lists', () => {
    expect(intersect([1, 3, 5, 7], [3, 4, 5, 9])).toEqual([3, 5])
  })

  it('intersects to nothing when they share nothing', () => {
    expect(intersect([1, 2], [3, 4])).toEqual([])
  })

  it('unions and sorts', () => {
    expect(union([[3, 1], [2, 3]])).toEqual([1, 2, 3])
  })
})

describe('matchesPhrase', () => {
  it('needs the words to sit together', () => {
    expect(matchesPhrase('all about the long now', 'the long now')).toBe(true)
    expect(matchesPhrase('the now is long', 'the long now')).toBe(false)
  })

  it('folds accents on both sides', () => {
    expect(matchesPhrase('a Café Wall illusion', 'cafe wall')).toBe(true)
  })

  it('accepts anything when there is no phrase to check', () => {
    expect(matchesPhrase('whatever', '')).toBe(true)
  })
})
