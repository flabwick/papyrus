import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useApp } from '../contexts/AppContext';
import TextBlock from './FormBlocks/TextBlock';
import TextboxBlock from './FormBlocks/TextboxBlock';
import ButtonBlock from './FormBlocks/ButtonBlock';
import ColourBlock from './FormBlocks/ColourBlock';
import EquationBlock from './FormBlocks/EquationBlock';

interface FormRendererProps {
  form: any;
  workspaceId: string;
  onFormUpdate?: () => void;
}

const FormRenderer: React.FC<FormRendererProps> = ({ 
  form, 
  workspaceId, 
  onFormUpdate 
}) => {
  const [formDefinition, setFormDefinition] = useState<any>(null);
  const [formState, setFormState] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const { setError: setGlobalError } = useApp();

  // Parse form DSL on mount and when form content changes
  useEffect(() => {
    parseFormDSL();
  }, [form.content, form.id]);

  // Auto-save form state changes
  useEffect(() => {
    if (Object.keys(formState).length > 0 && formDefinition) {
      const timeoutId = setTimeout(() => {
        saveFormState();
      }, 1000); // Debounce saves by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [formState]);

  const parseFormDSL = async () => {
    if (!form.content || form.content.trim() === '') {
      setFormDefinition(null);
      setFormState({});
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Validate DSL with backend
      const response = await api.post(`/forms/form/${form.id}/validate`, {
        content: form.content
      });

      const { definition, defaultState } = response.data;
      setFormDefinition(definition);
      
      // Merge existing form data with default state
      const existingState = form.formData || {};
      const mergedState = { ...defaultState, ...existingState };
      setFormState(mergedState);

    } catch (error: any) {
      console.error('Error parsing form DSL:', error);
      const errorMessage = error.response?.data?.error || 'Failed to parse form DSL';
      setError(errorMessage);
      setFormDefinition(null);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFormState = async () => {
    try {
      await api.put(`/forms/form/${form.id}`, {
        form_data: formState
      });
      setLastSaved(new Date());
    } catch (error: any) {
      console.error('Error saving form state:', error);
      // Don't show error to user for auto-save failures
    }
  };

  const handleStateChange = (blockId: string, value: any) => {
    setFormState((prev: any) => ({
      ...prev,
      [blockId]: value
    }));
  };

  const handleButtonExecute = async (blockId: string, operation: any) => {
    try {
      
      const response = await api.post(`/forms/form/${form.id}/execute`, {
        workspaceId,
        blockId,
        formState
      });

      // If this was a page generation, trigger auto-expansion and streaming
      if (response.data.result?.type === 'page_generated' && response.data.result?.pageId) {
        const pageId = response.data.result.pageId;
        // Store the page ID for auto-expansion after workspace refresh
        (window as any).formGeneratedPageId = pageId;
      }
      
      // Refresh workspace to show new content
      if (onFormUpdate) {
        onFormUpdate();
      }

      // Show success message
      setGlobalError(null);
      
    } catch (error: any) {
      console.error('Error executing operation:', error);
      const errorMessage = error.response?.data?.error || 'Failed to execute operation';
      throw new Error(errorMessage);
    }
  };

  const renderBlock = (block: any) => {
    const key = `${form.id}-${block.id}`;
    
    switch (block.blockType) {
      case 'text':
        return (
          <TextBlock
            key={key}
            block={block}
          />
        );
      
      case 'textbox':
        return (
          <TextboxBlock
            key={key}
            block={block}
            formState={formState}
            onStateChange={handleStateChange}
          />
        );
      
      case 'button':
        return (
          <ButtonBlock
            key={key}
            block={block}
            formState={formState}
            workspaceId={workspaceId}
            formId={form.id}
            onExecute={handleButtonExecute}
          />
        );
      
      case 'colour':
        return (
          <ColourBlock
            key={key}
            block={block}
          />
        );
      
      case 'equation':
        return (
          <EquationBlock
            key={key}
            block={block}
          />
        );
      
      default:
        return (
          <div key={key} className="form-block unknown-block">
            <div className="error-message">
              Unknown block type: {block.blockType}
            </div>
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="form-renderer loading">
        <div className="loading-spinner">⏳</div>
        <p>Parsing form...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="form-renderer error">
        <div className="error-header">
          <span className="error-icon">❌</span>
          <h4>Form DSL Error</h4>
        </div>
        <div className="error-message">{error}</div>
        <div className="error-help">
          <p>Check your form DSL syntax. Here's an example:</p>
          <pre className="dsl-example">{`form:
  title: "My Form"
  blocks:
    - block_type: "text"
      id: "intro"
      content: "Welcome to my form"
    
    - block_type: "textbox"
      id: "name"
      label: "Your Name:"
      required: true`}</pre>
        </div>
      </div>
    );
  }

  if (!formDefinition) {
    return (
      <div className="form-renderer empty">
        <div className="empty-state">
          <span className="empty-icon">📝</span>
          <h4>Empty Form</h4>
          <p>Add form DSL content to create an interactive form.</p>
          <button 
            className="example-button"
            onClick={() => {
              // This could trigger showing an example or help
              console.log('Show form help');
            }}
          >
            View Example DSL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-renderer active">
      <div className="form-header">
        <h3 className="form-title">{formDefinition.title}</h3>
        {lastSaved && (
          <div className="save-indicator">
            <span className="save-icon">💾</span>
            <small>Saved {lastSaved.toLocaleTimeString()}</small>
          </div>
        )}
      </div>
      
      <div className="form-blocks">
        {formDefinition.blocks.map(renderBlock)}
      </div>
      
      <div className="form-footer">
        <small className="form-info">
          {formDefinition.blocks.length} blocks • 
          Interactive form powered by DSL
        </small>
      </div>
    </div>
  );
};

export default FormRenderer;
