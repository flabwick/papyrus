import React, { useState, useEffect } from 'react';
import { Card as CardType, StreamCard } from '../types';
import api from '../services/api';

interface CardSearchInterfaceProps {
  brainId: string;
  streamId: string;
  streamCards: StreamCard[];
  onCardSelected: (card: CardType) => void;
  onCancel: () => void;
}

const CardSearchInterface: React.FC<CardSearchInterfaceProps> = ({
  brainId,
  streamId,
  streamCards,
  onCardSelected,
  onCancel
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CardType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [allCards, setAllCards] = useState<CardType[]>([]);

  // Get IDs of cards already in this stream
  const cardsInStreamIds = streamCards.map(sc => sc.cardId || sc.id).filter(Boolean);
  const cardsInStream = new Set(cardsInStreamIds);

  useEffect(() => {
    loadBrainCards();
  }, [brainId]);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch();
    } else {
      // Show all cards when no search query (excluding unsaved cards)
      setSearchResults(allCards.filter((card: CardType) => 
        !cardsInStream.has(card.id) && (card.cardType || 'saved') !== 'unsaved'
      ));
    }
  }, [searchQuery, allCards, streamCards]);

  const loadBrainCards = async () => {
    try {
      const response = await api.get(`/brains/${brainId}/cards`);
      const cards = response.data.cards || [];
      setAllCards(cards);
      // Initially show all available cards (not in current stream, excluding unsaved cards)
      setSearchResults(cards.filter((card: CardType) => 
        !cardsInStream.has(card.id) && (card.cardType || 'saved') !== 'unsaved'
      ));
    } catch (err) {
      console.error('Failed to load brain cards:', err);
    }
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Filter cards by title and content
      const filtered = allCards.filter((card: CardType) => {
        if (cardsInStream.has(card.id)) return false;
        
        // Exclude unsaved cards from search results
        if ((card.cardType || 'saved') === 'unsaved') return false;
        
        const titleMatch = card.title?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
        const displayTitleMatch = card.displayTitle?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
        const contentMatch = card.content?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
        return titleMatch || displayTitleMatch || contentMatch;
      });
      
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="card" style={{ borderStyle: 'solid', borderColor: '#3b82f6' }}>
      <div className="card-header">
        <h3 className="card-title">Add Existing Card to Stream</h3>
        <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '0.25rem' }}>
          Search for cards in this brain to add to the current stream
        </div>
      </div>
      
      <div className="card-content">
        {/* Search Input */}
        <div className="form-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            placeholder="Search cards by title or content..."
            autoFocus
          />
        </div>

        {/* Search Results */}
        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
          {isSearching ? (
            <div className="text-center" style={{ padding: '1rem' }}>
              <span className="loading-spinner" />
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center" style={{ padding: '1rem', color: '#6b7280' }}>
              {searchQuery ? 'No cards found matching your search.' : 'No cards available to add.'}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '0.5rem', fontSize: '14px', color: '#6b7280' }}>
                {searchResults.length} card{searchResults.length !== 1 ? 's' : ''} found
              </div>
              {searchResults.map(card => (
                <div
                  key={card.id}
                  className="card-search-result"
                  style={{
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                    cursor: 'pointer',
                    backgroundColor: '#fff'
                  }}
                  onClick={() => onCardSelected(card)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                    {card.displayTitle || card.title || 'Untitled'}
                  </div>
                  {card.content && (
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {card.content.substring(0, 100)}
                      {card.content.length > 100 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-sm justify-end">
          <button
            onClick={onCancel}
            className="btn btn-small"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CardSearchInterface;