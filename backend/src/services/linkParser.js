const Card = require('../models/Card');
const Brain = require('../models/Brain');
const { query, transaction } = require('../models/database');

/**
 * Link Parser Service
 * Handles parsing [[card-title]] syntax and managing card relationships
 */

class LinkParser {
  constructor() {
    // Regex patterns for different types of links
    this.patterns = {
      // Standard card link: [[card-title]]
      simple: /\[\[([^\]]+)\]\]/g,
      // Cross-brain link: [[brain-name/card-title]]
      crossBrain: /\[\[([^/\]]+)\/([^\]]+)\]\]/g,
      // Versioned link: [[card-title:v2]]
      versioned: /\[\[([^:\]]+):v(\d+)\]\]/g,
      // All link patterns combined
      all: /\[\[([^\]]+)\]\]/g
    };
  }

  /**
   * Extract all card links from content
   * @param {string} content - Content to parse
   * @returns {Array<Object>} - Array of link objects
   */
  extractLinks(content) {
    const links = [];
    const allMatches = [];
    
    // Find all [[...]] patterns
    let match;
    while ((match = this.patterns.all.exec(content)) !== null) {
      allMatches.push({
        fullMatch: match[0],
        linkText: match[1],
        startPosition: match.index,
        endPosition: match.index + match[0].length
      });
    }

    // Reset regex lastIndex
    this.patterns.all.lastIndex = 0;

    // Parse each match to determine link type
    for (const linkMatch of allMatches) {
      const link = this.parseLink(linkMatch.linkText, linkMatch.startPosition);
      if (link) {
        links.push({
          ...link,
          fullMatch: linkMatch.fullMatch,
          startPosition: linkMatch.startPosition,
          endPosition: linkMatch.endPosition
        });
      }
    }

    return links;
  }

  /**
   * Parse individual link text to determine type and extract components
   * @param {string} linkText - Text inside [[]]
   * @param {number} position - Position in content
   * @returns {Object|null} - Parsed link object or null if invalid
   */
  parseLink(linkText, position) {
    const trimmedText = linkText.trim();
    
    if (trimmedText.length === 0) {
      return null;
    }

    // Check for cross-brain link: brain-name/card-title
    const crossBrainMatch = trimmedText.match(/^([^/]+)\/(.+)$/);
    if (crossBrainMatch) {
      return {
        type: 'cross-brain',
        linkText: trimmedText,
        brainName: crossBrainMatch[1].trim(),
        cardTitle: crossBrainMatch[2].trim(),
        position
      };
    }

    // Check for versioned link: card-title:v2
    const versionedMatch = trimmedText.match(/^([^:]+):v(\d+)$/);
    if (versionedMatch) {
      return {
        type: 'versioned',
        linkText: trimmedText,
        cardTitle: versionedMatch[1].trim(),
        version: parseInt(versionedMatch[2]),
        position
      };
    }

    // Default to simple card link
    return {
      type: 'simple',
      linkText: trimmedText,
      cardTitle: trimmedText,
      position
    };
  }

  /**
   * Resolve links to actual card IDs within a brain
   * @param {Array<Object>} links - Array of parsed links
   * @param {string} sourceBrainId - Brain ID where the links are found
   * @param {string} sourceUserId - User ID for cross-brain access validation
   * @returns {Promise<Array<Object>>} - Array of resolved links
   */
  async resolveLinks(links, sourceBrainId, sourceUserId) {
    const resolvedLinks = [];

    for (const link of links) {
      const resolved = await this.resolveLink(link, sourceBrainId, sourceUserId);
      resolvedLinks.push(resolved);
    }

    return resolvedLinks;
  }

  /**
   * Resolve single link to card ID
   * @param {Object} link - Parsed link object
   * @param {string} sourceBrainId - Source brain ID
   * @param {string} sourceUserId - User ID for validation
   * @returns {Promise<Object>} - Resolved link with card ID or error
   */
  async resolveLink(link, sourceBrainId, sourceUserId) {
    const resolved = {
      ...link,
      targetCardId: null,
      targetBrainId: null,
      isValid: false,
      error: null
    };

    try {
      if (link.type === 'cross-brain') {
        // Find target brain
        const targetBrain = await Brain.findByUserAndName(sourceUserId, link.brainName);
        if (!targetBrain) {
          resolved.error = `Brain '${link.brainName}' not found`;
          return resolved;
        }

        // Find card in target brain
        const targetCard = await Card.findByBrainAndTitle(targetBrain.id, link.cardTitle);
        if (!targetCard) {
          resolved.error = `Card '${link.cardTitle}' not found in brain '${link.brainName}'`;
          return resolved;
        }

        resolved.targetCardId = targetCard.id;
        resolved.targetBrainId = targetBrain.id;
        resolved.isValid = true;

      } else {
        // Simple or versioned link - look in same brain
        const targetCard = await Card.findByBrainAndTitle(sourceBrainId, link.cardTitle);
        if (!targetCard) {
          resolved.error = `Card '${link.cardTitle}' not found`;
          return resolved;
        }

        resolved.targetCardId = targetCard.id;
        resolved.targetBrainId = sourceBrainId;
        resolved.isValid = true;
      }

    } catch (error) {
      console.error(`❌ Error resolving link ${link.linkText}:`, error.message);
      resolved.error = `Resolution error: ${error.message}`;
    }

    return resolved;
  }

  /**
   * Update card links in database
   * @param {string} sourceCardId - Source card ID
   * @param {Array<Object>} resolvedLinks - Array of resolved links
   * @returns {Promise<void>}
   */
  async updateCardLinks(sourceCardId, resolvedLinks) {
    await transaction(async (client) => {
      // Delete existing links for this card
      await client.query(
        'DELETE FROM card_links WHERE source_card_id = $1',
        [sourceCardId]
      );

      // Insert new links
      for (const link of resolvedLinks) {
        // Count instances of the same link text to handle multiple links to same card
        const sameLinks = resolvedLinks.filter(l => 
          l.linkText === link.linkText && 
          l.position <= link.position
        );
        const linkInstance = sameLinks.length;

        await client.query(`
          INSERT INTO card_links (
            source_card_id, target_card_id, link_text, position_in_source, 
            link_instance, is_valid, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [
          sourceCardId,
          link.targetCardId, // Can be null for broken links
          link.linkText,
          link.position,
          linkInstance,
          link.isValid
        ]);
      }

      console.log(`✅ Updated ${resolvedLinks.length} links for card ${sourceCardId}`);
    });
  }

  /**
   * Process all links in card content and update database
   * @param {string} sourceCardId - Source card ID
   * @param {string} content - Card content to parse
   * @returns {Promise<Object>} - Processing results
   */
  async processCardLinks(sourceCardId, content) {
    try {
      // Get card and brain info
      const sourceCard = await Card.findById(sourceCardId);
      if (!sourceCard) {
        throw new Error('Source card not found');
      }

      const brain = await Brain.findById(sourceCard.brainId);
      if (!brain) {
        throw new Error('Brain not found');
      }

      // Get user ID for cross-brain link validation
      const userResult = await query(
        'SELECT user_id FROM brains WHERE id = $1',
        [brain.id]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const userId = userResult.rows[0].user_id;

      // Extract links from content
      const links = this.extractLinks(content);
      
      if (links.length === 0) {
        // No links found, clear existing links
        await this.updateCardLinks(sourceCardId, []);
        return {
          success: true,
          linksFound: 0,
          linksResolved: 0,
          brokenLinks: 0,
          details: []
        };
      }

      // Resolve links
      const resolvedLinks = await this.resolveLinks(links, sourceCard.brainId, userId);
      
      // Update database
      await this.updateCardLinks(sourceCardId, resolvedLinks);

      // Generate summary
      const results = {
        success: true,
        linksFound: links.length,
        linksResolved: resolvedLinks.filter(l => l.isValid).length,
        brokenLinks: resolvedLinks.filter(l => !l.isValid).length,
        details: resolvedLinks.map(link => ({
          linkText: link.linkText,
          type: link.type,
          position: link.position,
          isValid: link.isValid,
          error: link.error,
          targetCardId: link.targetCardId
        }))
      };

      console.log(`✅ Processed ${results.linksFound} links for card ${sourceCardId}: ${results.linksResolved} valid, ${results.brokenLinks} broken`);
      
      return results;

    } catch (error) {
      console.error(`❌ Error processing card links for ${sourceCardId}:`, error.message);
      return {
        success: false,
        error: error.message,
        linksFound: 0,
        linksResolved: 0,
        brokenLinks: 0
      };
    }
  }

  /**
   * Get all broken links in a brain
   * @param {string} brainId - Brain ID
   * @returns {Promise<Array<Object>>} - Array of broken links with context
   */
  async getBrokenLinks(brainId) {
    const result = await query(`
      SELECT cl.*, c.title as source_title
      FROM card_links cl
      JOIN cards c ON cl.source_card_id = c.id
      WHERE c.brain_id = $1 AND cl.is_valid = false AND c.is_active = true
      ORDER BY c.title, cl.position_in_source
    `, [brainId]);

    return result.rows.map(row => ({
      sourceCardId: row.source_card_id,
      sourceCardTitle: row.source_title,
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance,
      createdAt: row.created_at
    }));
  }

  /**
   * Fix broken links by trying to resolve them again
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object>} - Repair results
   */
  async repairBrokenLinks(brainId) {
    try {
      const brokenLinks = await this.getBrokenLinks(brainId);
      
      if (brokenLinks.length === 0) {
        return {
          success: true,
          brokenLinksFound: 0,
          linksRepaired: 0,
          stillBroken: 0
        };
      }

      let repaired = 0;
      
      // Group broken links by source card
      const linksByCard = {};
      for (const link of brokenLinks) {
        if (!linksByCard[link.sourceCardId]) {
          linksByCard[link.sourceCardId] = [];
        }
        linksByCard[link.sourceCardId].push(link);
      }

      // Reprocess links for each card
      for (const [sourceCardId, cardLinks] of Object.entries(linksByCard)) {
        const card = await Card.findById(sourceCardId);
        if (card) {
          const content = await card.getContent();
          const result = await this.processCardLinks(sourceCardId, content);
          
          if (result.success && result.linksResolved > 0) {
            repaired += result.linksResolved;
          }
        }
      }

      return {
        success: true,
        brokenLinksFound: brokenLinks.length,
        linksRepaired: repaired,
        stillBroken: brokenLinks.length - repaired
      };

    } catch (error) {
      console.error(`❌ Error repairing broken links in brain ${brainId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get link statistics for a brain
   * @param {string} brainId - Brain ID
   * @returns {Promise<Object>} - Link statistics
   */
  async getLinkStats(brainId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_links,
        COUNT(CASE WHEN is_valid = false THEN 1 END) as broken_links,
        COUNT(DISTINCT source_card_id) as cards_with_links,
        COUNT(DISTINCT target_card_id) as referenced_cards
      FROM card_links cl
      JOIN cards c ON cl.source_card_id = c.id
      WHERE c.brain_id = $1 AND c.is_active = true
    `, [brainId]);

    const stats = result.rows[0];
    
    return {
      totalLinks: parseInt(stats.total_links),
      validLinks: parseInt(stats.valid_links),
      brokenLinks: parseInt(stats.broken_links),
      cardsWithLinks: parseInt(stats.cards_with_links),
      referencedCards: parseInt(stats.referenced_cards),
      linkHealth: stats.total_links > 0 ? 
        (parseInt(stats.valid_links) / parseInt(stats.total_links) * 100).toFixed(1) : 
        100
    };
  }

  /**
   * Find all cards that reference a specific card (backlinks)
   * @param {string} targetCardId - Target card ID
   * @returns {Promise<Array<Object>>} - Array of cards with link info
   */
  async getBacklinks(targetCardId) {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source, cl.link_instance
      FROM cards c
      JOIN card_links cl ON c.id = cl.source_card_id
      WHERE cl.target_card_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY c.title, cl.position_in_source
    `, [targetCardId]);

    return result.rows.map(row => ({
      card: new Card(row),
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance
    }));
  }

  /**
   * Find all cards that a specific card links to (forward links)
   * @param {string} sourceCardId - Source card ID
   * @returns {Promise<Array<Object>>} - Array of cards with link info
   */
  async getForwardLinks(sourceCardId) {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source, cl.link_instance
      FROM cards c
      JOIN card_links cl ON c.id = cl.target_card_id
      WHERE cl.source_card_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY cl.position_in_source
    `, [sourceCardId]);

    return result.rows.map(row => ({
      card: new Card(row),
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance
    }));
  }

  /**
   * Preview how content would be parsed (without updating database)
   * @param {string} content - Content to preview
   * @param {string} brainId - Brain ID for context
   * @param {string} userId - User ID for cross-brain validation
   * @returns {Promise<Object>} - Preview results
   */
  async previewLinks(content, brainId, userId) {
    try {
      const links = this.extractLinks(content);
      
      if (links.length === 0) {
        return {
          success: true,
          linksFound: 0,
          preview: []
        };
      }

      const resolvedLinks = await this.resolveLinks(links, brainId, userId);
      
      return {
        success: true,
        linksFound: links.length,
        preview: resolvedLinks.map(link => ({
          linkText: link.linkText,
          type: link.type,
          position: link.position,
          isValid: link.isValid,
          error: link.error,
          willLink: link.isValid ? `Card: ${link.targetCardId}` : 'No target'
        }))
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new LinkParser();