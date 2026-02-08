import React from 'react';

interface SearchHighlightProps {
  text: string;
  query: string;
  highlightClassName?: string;
  caseSensitive?: boolean;
}

/**
 * Highlights matching parts of text based on search query
 * Supports both exact match highlighting and fuzzy match highlighting
 */
const SearchHighlight: React.FC<SearchHighlightProps> = ({
  text,
  query,
  highlightClassName = 'bg-yellow-200 dark:bg-yellow-500/30 text-yellow-900 dark:text-yellow-200 rounded px-0.5',
  caseSensitive = false,
}) => {
  // If no query, return text as-is
  if (!query.trim()) {
    return <>{text}</>;
  }

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  // Try exact match first
  const exactIndex = searchText.indexOf(searchQuery);
  if (exactIndex !== -1) {
    const before = text.slice(0, exactIndex);
    const match = text.slice(exactIndex, exactIndex + query.length);
    const after = text.slice(exactIndex + query.length);

    return (
      <>
        {before}
        <mark className={highlightClassName}>{match}</mark>
        {after && <SearchHighlight text={after} query={query} highlightClassName={highlightClassName} caseSensitive={caseSensitive} />}
      </>
    );
  }

  // If no exact match, try fuzzy highlighting
  // Highlight individual matching characters
  const result: React.ReactNode[] = [];
  let queryIndex = 0;
  let currentRun = '';
  let isHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const searchChar = caseSensitive ? char : char.toLowerCase();
    const queryChar = searchQuery[queryIndex];

    if (queryIndex < searchQuery.length && searchChar === queryChar) {
      // Character matches query
      if (!isHighlighted && currentRun) {
        result.push(currentRun);
        currentRun = '';
      }
      isHighlighted = true;
      currentRun += char;
      queryIndex++;
    } else {
      // Character doesn't match
      if (isHighlighted && currentRun) {
        result.push(
          <mark key={`highlight-${result.length}`} className={highlightClassName}>
            {currentRun}
          </mark>
        );
        currentRun = '';
      }
      isHighlighted = false;
      currentRun += char;
    }
  }

  // Handle remaining characters
  if (currentRun) {
    if (isHighlighted) {
      result.push(
        <mark key={`highlight-${result.length}`} className={highlightClassName}>
          {currentRun}
        </mark>
      );
    } else {
      result.push(currentRun);
    }
  }

  return <>{result}</>;
};

/**
 * Utility function to check if text matches a search query
 * Uses both exact match and fuzzy match
 */
export function matchesSearch(text: string, query: string, caseSensitive = false): boolean {
  if (!query.trim()) return true;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  // Check for exact match
  if (searchText.includes(searchQuery)) return true;

  // Fuzzy match - check if all characters appear in order
  let queryIndex = 0;
  for (let i = 0; i < searchText.length && queryIndex < searchQuery.length; i++) {
    if (searchText[i] === searchQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === searchQuery.length;
}

/**
 * Get match score for sorting results by relevance
 * Higher score = better match
 */
export function getMatchScore(text: string, query: string, caseSensitive = false): number {
  if (!query.trim()) return 0;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  // Exact match at start gets highest score
  if (searchText.startsWith(searchQuery)) return 100;

  // Exact match anywhere gets high score
  const exactIndex = searchText.indexOf(searchQuery);
  if (exactIndex !== -1) {
    return 80 - (exactIndex / searchText.length) * 20;
  }

  // Fuzzy match gets lower score based on how spread out the matches are
  let matchCount = 0;
  let lastMatchIndex = -1;
  let totalDistance = 0;

  let queryIndex = 0;
  for (let i = 0; i < searchText.length && queryIndex < searchQuery.length; i++) {
    if (searchText[i] === searchQuery[queryIndex]) {
      matchCount++;
      if (lastMatchIndex !== -1) {
        totalDistance += i - lastMatchIndex - 1;
      }
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  if (matchCount === searchQuery.length) {
    // All characters matched
    const avgDistance = matchCount > 1 ? totalDistance / (matchCount - 1) : 0;
    return Math.max(10, 60 - avgDistance * 5);
  }

  return 0;
}

export default SearchHighlight;
