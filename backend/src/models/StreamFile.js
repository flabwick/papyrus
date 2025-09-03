const { query, transaction } = require('./database');

/**
 * StreamFile Model
 * Handles file references in streams (separate from cards)
 * Files and cards are different entities that can both appear in streams
 */

class StreamFile {
  constructor(data) {
    this.id = data.id;
    this.streamId = data.stream_id;
    this.fileId = data.file_id;
    this.position = data.position;
    this.depth = data.depth;
    this.isCollapsed = data.is_collapsed;
    this.addedAt = data.added_at;
  }

  /**
   * Add a file to a stream at a specific position
   * @param {string} streamId - Stream ID
   * @param {string} fileId - File ID  
   * @param {number} position - Position in stream (null for end)
   * @param {number} depth - Nesting depth (default: 0)
   * @param {Object} options - Additional options
   * @returns {Promise<StreamFile>} - Created StreamFile instance
   */
  static async addFileToStream(streamId, fileId, position = null, depth = 0, options = {}) {
    const { isCollapsed = false } = options;

    return await transaction(async (client) => {
      // Verify stream exists
      const streamResult = await client.query(
        'SELECT id FROM streams WHERE id = $1',
        [streamId]
      );

      if (streamResult.rows.length === 0) {
        throw new Error('Stream not found');
      }

      // Verify file exists
      const fileResult = await client.query(
        'SELECT id FROM files WHERE id = $1',
        [fileId]
      );

      if (fileResult.rows.length === 0) {
        throw new Error('File not found');
      }

      // Check if file is already in this stream
      const existingEntry = await client.query(
        'SELECT id FROM stream_files WHERE stream_id = $1 AND file_id = $2',
        [streamId, fileId]
      );

      if (existingEntry.rows.length > 0) {
        throw new Error('File is already in this stream');
      }

      // Determine position
      let actualPosition = position;
      if (actualPosition === null) {
        // Get next available position considering both cards and files
        const maxCardPos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM stream_cards WHERE stream_id = $1',
          [streamId]
        );
        const maxFilePos = await client.query(
          'SELECT COALESCE(MAX(position), -1) as max_pos FROM stream_files WHERE stream_id = $1',
          [streamId]
        );
        
        const maxCardPosition = maxCardPos.rows[0].max_pos;
        const maxFilePosition = maxFilePos.rows[0].max_pos;
        actualPosition = Math.max(maxCardPosition, maxFilePosition) + 1;
      } else {
        // Shift existing items to make room
        await client.query(
          'UPDATE stream_cards SET position = position + 1 WHERE stream_id = $1 AND position >= $2',
          [streamId, actualPosition]
        );
        await client.query(
          'UPDATE stream_files SET position = position + 1 WHERE stream_id = $1 AND position >= $2',
          [streamId, actualPosition]
        );
      }

      // Insert the file reference
      const result = await client.query(`
        INSERT INTO stream_files (stream_id, file_id, position, depth, is_collapsed)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [streamId, fileId, actualPosition, depth, isCollapsed]);

      console.log(`✅ Added file ${fileId} to stream ${streamId} at position ${actualPosition}`);
      return new StreamFile(result.rows[0]);
    });
  }


  /**
   * Get all files in a stream with their metadata
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array<Object>>} - Array of files with stream metadata
   */
  static async getStreamFiles(streamId) {
    const result = await query(`
      SELECT f.*, sf.position, sf.depth, sf.is_collapsed, sf.added_at
      FROM files f
      JOIN stream_files sf ON f.id = sf.file_id
      WHERE sf.stream_id = $1
      ORDER BY sf.position
    `, [streamId]);

    return result.rows.map(row => ({
      id: row.id,
      brainId: row.brain_id,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      filePath: row.file_path,
      // PDF metadata
      pdfPageCount: row.pdf_page_count,
      pdfAuthor: row.pdf_author,
      pdfTitle: row.pdf_title,
      // EPUB metadata  
      epubTitle: row.epub_title,
      epubAuthor: row.epub_author,
      epubDescription: row.epub_description,
      epubChapterCount: row.epub_chapter_count,
      coverImagePath: row.cover_image_path,
      // Common metadata
      contentPreview: row.content_preview,
      processingStatus: row.processing_status,
      uploadedAt: row.uploaded_at,
      // Stream-specific metadata
      position: row.position,
      depth: row.depth,
      isCollapsed: row.is_collapsed,
      addedAt: row.added_at,
      // Mark as file for frontend
      itemType: 'file'
    }));
  }

  /**
   * Get mixed stream items (both cards and files) in position order
   * @param {string} streamId - Stream ID
   * @returns {Promise<Array<Object>>} - Array of mixed stream items
   */
  static async getStreamItems(streamId) {
    const result = await query(`
      SELECT 
        item_type,
        position,
        depth,
        is_collapsed,
        added_at,
        card_id,
        file_id
      FROM stream_items_view
      WHERE stream_id = $1
      ORDER BY position
    `, [streamId]);

    const items = [];
    const Card = require('./Card');

    for (const row of result.rows) {
      if (row.item_type === 'card') {
        // Get full card data
        const card = await Card.findById(row.card_id);
        if (card) {
          const cardData = await card.toJSON(false);
          cardData.position = row.position;
          cardData.depth = row.depth;
          cardData.isCollapsed = row.is_collapsed;
          cardData.addedAt = row.added_at;
          cardData.itemType = 'card';
          items.push(cardData);
        }
      } else if (row.item_type === 'file') {
        // Get full file data
        const fileResult = await query(`
          SELECT f.*, sf.position, sf.depth, sf.is_collapsed, sf.added_at
          FROM files f
          JOIN stream_files sf ON f.id = sf.file_id
          WHERE sf.file_id = $1
        `, [row.file_id]);

        if (fileResult.rows.length > 0) {
          const fileRow = fileResult.rows[0];
          const fileData = {
            id: fileRow.id,
            brainId: fileRow.brain_id,
            fileName: fileRow.file_name,
            fileType: fileRow.file_type,
            fileSize: fileRow.file_size,
            filePath: fileRow.file_path,
            // Metadata based on file type
            title: fileRow.file_type === 'epub' ? fileRow.epub_title : fileRow.pdf_title,
            author: fileRow.file_type === 'epub' ? fileRow.epub_author : fileRow.pdf_author,
            description: fileRow.epub_description,
            pageCount: fileRow.pdf_page_count,
            chapterCount: fileRow.epub_chapter_count,
            coverImagePath: fileRow.cover_image_path,
            // Common fields
            contentPreview: fileRow.content_preview,
            processingStatus: fileRow.processing_status,
            uploadedAt: fileRow.uploaded_at,
            // Stream metadata
            position: fileRow.position,
            depth: fileRow.depth,
            isCollapsed: fileRow.is_collapsed,
            addedAt: fileRow.added_at,
            itemType: 'file'
          };
          items.push(fileData);
        }
      }
    }

    return items;
  }

  /**
   * Move a file to a different position in the stream
   * @param {string} streamId - Stream ID
   * @param {string} fileId - File ID
   * @param {number} newPosition - New position
   * @returns {Promise<void>}
   */
  static async moveFile(streamId, fileId, newPosition) {
    return await transaction(async (client) => {
      // Get current position
      const result = await client.query(
        'SELECT position FROM stream_files WHERE stream_id = $1 AND file_id = $2',
        [streamId, fileId]
      );

      if (result.rows.length === 0) {
        throw new Error('File not found in stream');
      }

      const oldPosition = result.rows[0].position;

      if (oldPosition === newPosition) {
        return; // No change needed
      }

      if (newPosition > oldPosition) {
        // Moving down: shift items up
        await client.query(`
          UPDATE stream_cards SET position = position - 1 
          WHERE stream_id = $1 AND position > $2 AND position <= $3
        `, [streamId, oldPosition, newPosition]);

        await client.query(`
          UPDATE stream_files SET position = position - 1 
          WHERE stream_id = $1 AND position > $2 AND position <= $3 AND file_id != $4
        `, [streamId, oldPosition, newPosition, fileId]);
      } else {
        // Moving up: shift items down
        await client.query(`
          UPDATE stream_cards SET position = position + 1 
          WHERE stream_id = $1 AND position >= $2 AND position < $3
        `, [streamId, newPosition, oldPosition]);

        await client.query(`
          UPDATE stream_files SET position = position + 1 
          WHERE stream_id = $1 AND position >= $2 AND position < $3 AND file_id != $4
        `, [streamId, newPosition, oldPosition, fileId]);
      }

      // Update the file's position
      await client.query(
        'UPDATE stream_files SET position = $1 WHERE stream_id = $2 AND file_id = $3',
        [newPosition, streamId, fileId]
      );

      console.log(`✅ Moved file ${fileId} from position ${oldPosition} to ${newPosition} in stream ${streamId}`);
    });
  }

  /**
   * Remove file from stream (returns status for API)
   * @param {string} streamId - Stream ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} - Result with removed status
   */
  static async removeFileFromStream(streamId, fileId) {
    try {
      // Get the file's position before deleting
      const result = await query(
        'SELECT position FROM stream_files WHERE stream_id = $1 AND file_id = $2',
        [streamId, fileId]
      );

      if (result.rows.length === 0) {
        return { removed: false, error: 'File not found in stream' };
      }

      const removedPosition = result.rows[0].position;

      await transaction(async (client) => {
        // Delete the file reference
        await client.query(
          'DELETE FROM stream_files WHERE stream_id = $1 AND file_id = $2',
          [streamId, fileId]
        );

        // Compact positions - shift everything down
        await client.query(
          'UPDATE stream_cards SET position = position - 1 WHERE stream_id = $1 AND position > $2',
          [streamId, removedPosition]
        );
        await client.query(
          'UPDATE stream_files SET position = position - 1 WHERE stream_id = $1 AND position > $2',
          [streamId, removedPosition]
        );
      });

      console.log(`✅ Removed file ${fileId} from stream ${streamId}`);
      return { removed: true, fileId, streamId, removedPosition };
    } catch (error) {
      console.error('❌ Error removing file from stream:', error);
      return { removed: false, error: error.message };
    }
  }

  /**
   * Update file position in stream
   * @param {string} streamId - Stream ID
   * @param {string} fileId - File ID
   * @param {number} newPosition - New position
   * @returns {Promise<Object>} - Result with updated status
   */
  static async updateFilePosition(streamId, fileId, newPosition) {
    try {
      await this.moveFile(streamId, fileId, newPosition);
      return { updated: true, fileId, streamId, newPosition };
    } catch (error) {
      console.error('❌ Error updating file position:', error);
      return { updated: false, error: error.message };
    }
  }
}

module.exports = StreamFile;