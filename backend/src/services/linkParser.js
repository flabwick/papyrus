const Page = require('../models/Page');
const Library = require('../models/Library');
const { query, transaction } = require('../models/database');

/**
 * Link Parser Service
 * Handles parsing [[page-title]] syntax and managing page relationships
 */

class LinkParser {
  constructor() {
    // Regex patterns for different types of links
    this.patterns = {
      // Standard page link: [[page-title]]
      simple: /\[\[([^\]]+)\]\]/g,
      // Cross-library link: [[library-name/page-title]]
      crossLibrary: /\[\[([^/\]]+)\/([^\]]+)\]\]/g,
      // Versioned link: [[page-title:v2]]
      versioned: /\[\[([^:\]]+):v(\d+)\]\]/g,
      // All link patterns combined
      all: /\[\[([^\]]+)\]\]/g
    };
  }

  /**
   * Extract all page links from content
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

    // Check for cross-library link: library-name/page-title
    const crossLibraryMatch = trimmedText.match(/^([^/]+)\/(.+)$/);
    if (crossLibraryMatch) {
      return {
        type: 'cross-library',
        linkText: trimmedText,
        libraryName: crossLibraryMatch[1].trim(),
        pageTitle: crossLibraryMatch[2].trim(),
        position
      };
    }

    // Check for versioned link: page-title:v2
    const versionedMatch = trimmedText.match(/^([^:]+):v(\d+)$/);
    if (versionedMatch) {
      return {
        type: 'versioned',
        linkText: trimmedText,
        pageTitle: versionedMatch[1].trim(),
        version: parseInt(versionedMatch[2]),
        position
      };
    }

    // Default to simple page link
    return {
      type: 'simple',
      linkText: trimmedText,
      pageTitle: trimmedText,
      position
    };
  }

  /**
   * Resolve links to actual page IDs within a library
   * @param {Array<Object>} links - Array of parsed links
   * @param {string} sourceLibraryId - Library ID where the links are found
   * @param {string} sourceUserId - User ID for cross-library access validation
   * @returns {Promise<Array<Object>>} - Array of resolved links
   */
  async resolveLinks(links, sourceLibraryId, sourceUserId) {
    const resolvedLinks = [];

    for (const link of links) {
      const resolved = await this.resolveLink(link, sourceLibraryId, sourceUserId);
      resolvedLinks.push(resolved);
    }

    return resolvedLinks;
  }

  /**
   * Resolve single link to page ID
   * @param {Object} link - Parsed link object
   * @param {string} sourceLibraryId - Source library ID
   * @param {string} sourceUserId - User ID for validation
   * @returns {Promise<Object>} - Resolved link with page ID or error
   */
  async resolveLink(link, sourceLibraryId, sourceUserId) {
    const resolved = {
      ...link,
      targetPageId: null,
      targetLibraryId: null,
      isValid: false,
      error: null
    };

    try {
      if (link.type === 'cross-library') {
        // Find target library
        const targetLibrary = await Library.findByUserAndName(sourceUserId, link.libraryName);
        if (!targetLibrary) {
          resolved.error = `Library '${link.libraryName}' not found`;
          return resolved;
        }

        // Find page in target library
        const targetPage = await Page.findByLibraryAndTitle(targetLibrary.id, link.pageTitle);
        if (!targetPage) {
          resolved.error = `Page '${link.pageTitle}' not found in library '${link.libraryName}'`;
          return resolved;
        }

        resolved.targetPageId = targetPage.id;
        resolved.targetLibraryId = targetLibrary.id;
        resolved.isValid = true;

      } else {
        // Simple or versioned link - look in same library
        const targetPage = await Page.findByLibraryAndTitle(sourceLibraryId, link.pageTitle);
        if (!targetPage) {
          resolved.error = `Page '${link.pageTitle}' not found`;
          return resolved;
        }

        resolved.targetPageId = targetPage.id;
        resolved.targetLibraryId = sourceLibraryId;
        resolved.isValid = true;
      }

    } catch (error) {
      console.error(`❌ Error resolving link ${link.linkText}:`, error.message);
      resolved.error = `Resolution error: ${error.message}`;
    }

    return resolved;
  }

  /**
   * Update page links in database
   * @param {string} sourcePageId - Source page ID
   * @param {Array<Object>} resolvedLinks - Array of resolved links
   * @returns {Promise<void>}
   */
  async updatePageLinks(sourcePageId, resolvedLinks) {
    await transaction(async (client) => {
      // Delete existing links for this page
      await client.query(
        'DELETE FROM page_links WHERE source_page_id = $1',
        [sourcePageId]
      );

      // Insert new links
      for (const link of resolvedLinks) {
        // Count instances of the same link text to handle multiple links to same page
        const sameLinks = resolvedLinks.filter(l => 
          l.linkText === link.linkText && 
          l.position <= link.position
        );
        const linkInstance = sameLinks.length;

        await client.query(`
          INSERT INTO page_links (
            source_page_id, target_page_id, link_text, position_in_source, 
            link_instance, is_valid, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [
          sourcePageId,
          link.targetPageId, // Can be null for broken links
          link.linkText,
          link.position,
          linkInstance,
          link.isValid
        ]);
      }

      console.log(`✅ Updated ${resolvedLinks.length} links for page ${sourcePageId}`);
    });
  }

  /**
   * Process all links in page content and update database
   * @param {string} sourcePageId - Source page ID
   * @param {string} content - Page content to parse
   * @returns {Promise<Object>} - Processing results
   */
  async processPageLinks(sourcePageId, content) {
    try {
      // Get page and library info
      const sourcePage = await Page.findById(sourcePageId);
      if (!sourcePage) {
        throw new Error('Source page not found');
      }

      const library = await Library.findById(sourcePage.libraryId);
      if (!library) {
        throw new Error('Library not found');
      }

      // Get user ID for cross-library link validation
      const userResult = await query(
        'SELECT user_id FROM libraries WHERE id = $1',
        [library.id]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const userId = userResult.rows[0].user_id;

      // Extract links from content
      const links = this.extractLinks(content);
      
      if (links.length === 0) {
        // No links found, clear existing links
        await this.updatePageLinks(sourcePageId, []);
        return {
          success: true,
          linksFound: 0,
          linksResolved: 0,
          brokenLinks: 0,
          details: []
        };
      }

      // Resolve links
      const resolvedLinks = await this.resolveLinks(links, sourcePage.libraryId, userId);
      
      // Update database
      await this.updatePageLinks(sourcePageId, resolvedLinks);

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
          targetPageId: link.targetPageId
        }))
      };

      console.log(`✅ Processed ${results.linksFound} links for page ${sourcePageId}: ${results.linksResolved} valid, ${results.brokenLinks} broken`);
      
      return results;

    } catch (error) {
      console.error(`❌ Error processing page links for ${sourcePageId}:`, error.message);
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
   * Get all broken links in a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Array<Object>>} - Array of broken links with context
   */
  async getBrokenLinks(libraryId) {
    const result = await query(`
      SELECT cl.*, c.title as source_title
      FROM page_links cl
      JOIN pages c ON cl.source_page_id = c.id
      WHERE c.library_id = $1 AND cl.is_valid = false AND c.is_active = true
      ORDER BY c.title, cl.position_in_source
    `, [libraryId]);

    return result.rows.map(row => ({
      sourcePageId: row.source_page_id,
      sourcePageTitle: row.source_title,
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance,
      createdAt: row.created_at
    }));
  }

  /**
   * Fix broken links by trying to resolve them again
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Repair results
   */
  async repairBrokenLinks(libraryId) {
    try {
      const brokenLinks = await this.getBrokenLinks(libraryId);
      
      if (brokenLinks.length === 0) {
        return {
          success: true,
          brokenLinksFound: 0,
          linksRepaired: 0,
          stillBroken: 0
        };
      }

      let repaired = 0;
      
      // Group broken links by source page
      const linksByPage = {};
      for (const link of brokenLinks) {
        if (!linksByPage[link.sourcePageId]) {
          linksByPage[link.sourcePageId] = [];
        }
        linksByPage[link.sourcePageId].push(link);
      }

      // Reprocess links for each page
      for (const [sourcePageId, pageLinks] of Object.entries(linksByPage)) {
        const page = await Page.findById(sourcePageId);
        if (page) {
          const content = await page.getContent();
          const result = await this.processPageLinks(sourcePageId, content);
          
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
      console.error(`❌ Error repairing broken links in library ${libraryId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get link statistics for a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} - Link statistics
   */
  async getLinkStats(libraryId) {
    const result = await query(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(CASE WHEN is_valid = true THEN 1 END) as valid_links,
        COUNT(CASE WHEN is_valid = false THEN 1 END) as broken_links,
        COUNT(DISTINCT source_page_id) as pages_with_links,
        COUNT(DISTINCT target_page_id) as referenced_pages
      FROM page_links cl
      JOIN pages c ON cl.source_page_id = c.id
      WHERE c.library_id = $1 AND c.is_active = true
    `, [libraryId]);

    const stats = result.rows[0];
    
    return {
      totalLinks: parseInt(stats.total_links),
      validLinks: parseInt(stats.valid_links),
      brokenLinks: parseInt(stats.broken_links),
      pagesWithLinks: parseInt(stats.pages_with_links),
      referencedPages: parseInt(stats.referenced_pages),
      linkHealth: stats.total_links > 0 ? 
        (parseInt(stats.valid_links) / parseInt(stats.total_links) * 100).toFixed(1) : 
        100
    };
  }

  /**
   * Find all pages that reference a specific page (backlinks)
   * @param {string} targetPageId - Target page ID
   * @returns {Promise<Array<Object>>} - Array of pages with link info
   */
  async getBacklinks(targetPageId) {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source, cl.link_instance
      FROM pages c
      JOIN page_links cl ON c.id = cl.source_page_id
      WHERE cl.target_page_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY c.title, cl.position_in_source
    `, [targetPageId]);

    return result.rows.map(row => ({
      page: new Page(row),
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance
    }));
  }

  /**
   * Find all pages that a specific page links to (forward links)
   * @param {string} sourcePageId - Source page ID
   * @returns {Promise<Array<Object>>} - Array of pages with link info
   */
  async getForwardLinks(sourcePageId) {
    const result = await query(`
      SELECT c.*, cl.link_text, cl.position_in_source, cl.link_instance
      FROM pages c
      JOIN page_links cl ON c.id = cl.target_page_id
      WHERE cl.source_page_id = $1 AND cl.is_valid = true AND c.is_active = true
      ORDER BY cl.position_in_source
    `, [sourcePageId]);

    return result.rows.map(row => ({
      page: new Page(row),
      linkText: row.link_text,
      position: row.position_in_source,
      linkInstance: row.link_instance
    }));
  }

  /**
   * Preview how content would be parsed (without updating database)
   * @param {string} content - Content to preview
   * @param {string} libraryId - Library ID for context
   * @param {string} userId - User ID for cross-library validation
   * @returns {Promise<Object>} - Preview results
   */
  async previewLinks(content, libraryId, userId) {
    try {
      const links = this.extractLinks(content);
      
      if (links.length === 0) {
        return {
          success: true,
          linksFound: 0,
          preview: []
        };
      }

      const resolvedLinks = await this.resolveLinks(links, libraryId, userId);
      
      return {
        success: true,
        linksFound: links.length,
        preview: resolvedLinks.map(link => ({
          linkText: link.linkText,
          type: link.type,
          position: link.position,
          isValid: link.isValid,
          error: link.error,
          willLink: link.isValid ? `Page: ${link.targetPageId}` : 'No target'
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