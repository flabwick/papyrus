const yaml = require('js-yaml');

/**
 * Form DSL Parser
 * Parses YAML form definitions and validates structure
 */

class FormDSLParser {
  /**
   * Parse YAML form definition into structured data
   * @param {string} yamlContent - YAML form definition
   * @returns {Object} - Parsed form structure
   */
  static parseFormDSL(yamlContent) {
    try {
      const parsed = yaml.load(yamlContent);
      
      if (!parsed || !parsed.form) {
        throw new Error('Invalid form DSL: missing "form" root element');
      }

      const form = parsed.form;
      
      // Validate required fields
      if (!form.title) {
        throw new Error('Invalid form DSL: missing "title" field');
      }

      if (!form.blocks || !Array.isArray(form.blocks)) {
        throw new Error('Invalid form DSL: missing or invalid "blocks" array');
      }

      // Validate and process blocks
      const processedBlocks = form.blocks.map((block, index) => {
        return this.validateAndProcessBlock(block, index);
      });

      return {
        title: form.title,
        blocks: processedBlocks,
        metadata: {
          version: '1.0',
          parsedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      if (error.name === 'YAMLException') {
        throw new Error(`YAML parsing error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate and process individual form block
   * @param {Object} block - Block definition
   * @param {number} index - Block index for error reporting
   * @returns {Object} - Processed block
   */
  static validateAndProcessBlock(block, index) {
    if (!block.block_type) {
      throw new Error(`Block ${index}: missing "block_type" field`);
    }

    if (!block.id) {
      throw new Error(`Block ${index}: missing "id" field`);
    }

    // Validate ID uniqueness will be done at form level
    const processedBlock = {
      blockType: block.block_type,
      id: block.id,
      visibility: block.visibility || 'visible'
    };

    switch (block.block_type) {
      case 'text':
        return this.processTextBlock(block, processedBlock, index);
      
      case 'textbox':
        return this.processTextboxBlock(block, processedBlock, index);
      
      case 'button':
        return this.processButtonBlock(block, processedBlock, index);
      
      default:
        throw new Error(`Block ${index}: unsupported block_type "${block.block_type}"`);
    }
  }

  /**
   * Process text block
   */
  static processTextBlock(block, processedBlock, index) {
    if (!block.content) {
      throw new Error(`Text block ${index}: missing "content" field`);
    }

    return {
      ...processedBlock,
      content: block.content
    };
  }

  /**
   * Process textbox block
   */
  static processTextboxBlock(block, processedBlock, index) {
    if (!block.label) {
      throw new Error(`Textbox block ${index}: missing "label" field`);
    }

    return {
      ...processedBlock,
      label: block.label,
      value: block.value || '',
      required: block.required || false,
      style: block.style || 'single',
      placeholder: block.placeholder || ''
    };
  }

  /**
   * Process button block
   */
  static processButtonBlock(block, processedBlock, index) {
    if (!block.text) {
      throw new Error(`Button block ${index}: missing "text" field`);
    }

    if (!block.action_type) {
      throw new Error(`Button block ${index}: missing "action_type" field`);
    }

    const validActionTypes = ['workspace_operation'];
    if (!validActionTypes.includes(block.action_type)) {
      throw new Error(`Button block ${index}: invalid action_type "${block.action_type}"`);
    }

    const result = {
      ...processedBlock,
      text: block.text,
      disabled: block.disabled || false,
      actionType: block.action_type
    };

    if (block.action_type === 'workspace_operation') {
      if (!block.workspace_operation) {
        throw new Error(`Button block ${index}: missing "workspace_operation" configuration`);
      }

      result.workspaceOperation = this.processWorkspaceOperation(
        block.workspace_operation, 
        index
      );
    }

    return result;
  }

  /**
   * Process workspace operation configuration
   */
  static processWorkspaceOperation(operation, blockIndex) {
    if (!operation.type) {
      throw new Error(`Button block ${blockIndex}: workspace_operation missing "type" field`);
    }

    const validTypes = ['create_card', 'generate'];
    if (!validTypes.includes(operation.type)) {
      throw new Error(`Button block ${blockIndex}: invalid workspace_operation type "${operation.type}"`);
    }

    const result = {
      type: operation.type,
      position: operation.position || 'below' // Default to below the form
    };

    // Validate position
    const validPositions = ['above', 'below', 'top', 'bottom'];
    if (!validPositions.includes(result.position)) {
      throw new Error(`Button block ${blockIndex}: invalid position "${result.position}". Must be one of: ${validPositions.join(', ')}`);
    }

    if (operation.type === 'create_card') {
      result.title = operation.title || 'New Page';
      result.content = operation.content || '';
    } else if (operation.type === 'generate') {
      if (!operation.prompt) {
        throw new Error(`Button block ${blockIndex}: generate operation missing "prompt" field`);
      }
      result.prompt = operation.prompt;
      result.count = operation.count || 1;
      result.output_type = operation.output_type || 'page'; // Default to page generation
      
      // Validate output_type
      const validOutputTypes = ['page', 'form'];
      if (!validOutputTypes.includes(result.output_type)) {
        throw new Error(`Button block ${blockIndex}: invalid output_type "${result.output_type}". Must be one of: ${validOutputTypes.join(', ')}`);
      }
    }

    return result;
  }

  /**
   * Resolve template variables in text using form state
   * @param {string} text - Text with template variables
   * @param {Object} formState - Current form state
   * @returns {string} - Text with resolved variables
   */
  static resolveTemplateVariables(text, formState) {
    if (!text || typeof text !== 'string') {
      return text;
    }


    // Match {{block-id.property}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    return text.replace(variablePattern, (match, variable) => {
      // Handle {{block-id.property}} pattern
      const parts = variable.split('.');
      
      if (parts.length === 2) {
        const [blockId, property] = parts;
        
        if (formState[blockId] && formState[blockId][property] !== undefined) {
          return formState[blockId][property];
        }
      } else {
        // Handle simple {{block-id}} pattern (for backward compatibility)
        if (formState[variable]) {
          return formState[variable].value || '';
        }
      }
      
      return match; // Return original if not found
    });
  }

  /**
   * Validate form state against form definition
   * @param {Object} formDefinition - Parsed form definition
   * @param {Object} formState - Current form state
   * @returns {Object} - Validation result
   */
  static validateFormState(formDefinition, formState) {
    const errors = [];
    const warnings = [];

    // Check required fields
    formDefinition.blocks.forEach(block => {
      if (block.blockType === 'textbox' && block.required) {
        const value = formState[block.id]?.value;
        if (!value || value.trim() === '') {
          errors.push(`Required field "${block.label}" is empty`);
        }
      }
    });

    // Check for unknown state keys
    Object.keys(formState).forEach(stateKey => {
      const blockExists = formDefinition.blocks.some(block => block.id === stateKey);
      if (!blockExists) {
        warnings.push(`Unknown form state key: ${stateKey}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get default form state from definition
   * @param {Object} formDefinition - Parsed form definition
   * @returns {Object} - Default form state
   */
  static getDefaultFormState(formDefinition) {
    const state = {};

    formDefinition.blocks.forEach(block => {
      switch (block.blockType) {
        case 'textbox':
          state[block.id] = {
            value: block.value || '',
            type: 'textbox'
          };
          break;
        
        case 'button':
          state[block.id] = {
            disabled: block.disabled || false,
            type: 'button'
          };
          break;
        
        // Text blocks don't have state
        case 'text':
        default:
          break;
      }
    });

    return state;
  }

  /**
   * Create example form DSL for testing/documentation
   * @returns {string} - Example YAML form definition
   */
  static createExampleForm() {
    return `form:
  title: "Research Planning Form"
  blocks:
    - block_type: "text"
      id: "intro-text"
      content: "Plan your research project by filling out the details below."
      visibility: "visible"
    
    - block_type: "textbox"
      id: "research-topic"
      label: "Research Topic:"
      value: ""
      required: true
      style: "single"
      placeholder: "Enter your research topic"
    
    - block_type: "textbox"
      id: "methodology"
      label: "Methodology:"
      value: ""
      required: false
      style: "multi"
      placeholder: "Describe your research methodology"
    
    - block_type: "button"
      id: "submit"
      text: "Create Page"
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        position: "below"
        title: "New Page: {{name.value}}"
        content: "Hello {{name.value}}!"
    
    - block_type: "button"
      id: "create-outline"
      text: "Create Project Outline"
      disabled: false
      action_type: "workspace_operation"
      workspace_operation:
        type: "create_card"
        position: "below"
        title: "Research Project: {{research-topic.value}}"
        content: "# {{research-topic.value}}\\n\\n## Methodology\\n{{methodology.value}}\\n\\n## Next Steps\\n- [ ] Literature review\\n- [ ] Data collection\\n- [ ] Analysis"
    
    - block_type: "button"
      id: "generate-questions"
      text: "Generate Research Questions"
      disabled: false
      action_type: "workspace_operation"
      workspace_operation:
        type: "generate"
        position: "bottom"
        output_type: "page"
        prompt: "Generate 5 specific research questions for the topic '{{research-topic.value}}' using {{methodology.value}} methodology. Make them actionable and measurable."
        count: 1
    
    - block_type: "button"
      id: "generate-form"
      text: "Generate Related Form"
      disabled: false
      action_type: "workspace_operation"
      workspace_operation:
        type: "generate"
        position: "below"
        output_type: "form"
        prompt: "Create a form for collecting detailed information about {{research-topic.value}} research. Include fields for methodology, timeline, budget, and team members."
        count: 1`;
}
}

module.exports = FormDSLParser;
