import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useApp } from '../contexts/AppContext';
import FormRenderer from './FormRenderer';

interface FormCardProps {
  form: any;
  workspaceId: string;
  onRemove: (formId: string) => void;
  onToggleAI: (formId: string) => void;
  onToggleCollapse: (formId: string) => void;
  showAddInterface?: boolean;
  onShowAddInterface?: (show: boolean) => void;
  onWorkspaceUpdate?: () => void;
}

const FormCard: React.FC<FormCardProps> = ({
  form,
  workspaceId,
  onRemove,
  onToggleAI,
  onToggleCollapse,
  showAddInterface = false,
  onShowAddInterface,
  onWorkspaceUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(!form.isCollapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(form.title || 'Untitled Form');
  const [editedContent, setEditedContent] = useState(form.content || '');

  // Update edited content when form content changes (e.g., on refresh)
  useEffect(() => {
    console.log('Form content changed:', form.content);
    setEditedContent(form.content || '');
    setEditedTitle(form.title || 'Untitled Form');
  }, [form.content, form.title]);
  const [isSaving, setIsSaving] = useState(false);
  const [localShowAddInterface, setLocalShowAddInterface] = useState(showAddInterface);
  const { setError } = useApp();

  // Sync local state with prop
  useEffect(() => {
    setLocalShowAddInterface(showAddInterface);
  }, [showAddInterface]);

  const handleSave = async () => {
    if (!editedTitle.trim()) {
      setError('Form title cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      console.log('Saving form with content:', editedContent);
      
      const response = await api.put(`/forms/form/${form.id}`, {
        title: editedTitle.trim(),
        content: editedContent
      });

      console.log('Form save response:', response.data);

      // Update local state
      form.title = editedTitle.trim();
      form.content = editedContent;
      setIsEditing(false);
      
      console.log('Form saved successfully');
      
      // Trigger workspace refresh to ensure form content persists
      if (onWorkspaceUpdate) {
        onWorkspaceUpdate();
      }
    } catch (error: any) {
      console.error('Error saving form:', error);
      setError(error.response?.data?.error || 'Failed to save form');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedTitle(form.title || 'Untitled Form');
    setEditedContent(form.content || '');
    setIsEditing(false);
  };

  const handleRemove = async () => {
    if (window.confirm('Remove this form from the workspace?')) {
      onRemove(form.id);
    }
  };

  const handleToggleAI = async () => {
    try {
      await api.put(`/workspaces/${workspaceId}/forms/${form.id}/ai-context`);
      onToggleAI(form.id);
    } catch (error: any) {
      console.error('Error toggling AI context:', error);
      setError(error.response?.data?.error || 'Failed to toggle AI context');
    }
  };

  const handleToggleCollapse = async () => {
    try {
      await api.put(`/workspaces/${workspaceId}/forms/${form.id}/collapsed`);
      setIsExpanded(!isExpanded);
      onToggleCollapse(form.id);
    } catch (error: any) {
      console.error('Error toggling collapse:', error);
      setError(error.response?.data?.error || 'Failed to toggle collapse');
    }
  };

  const handleAddPageClick = () => {
    const newState = !localShowAddInterface;
    setLocalShowAddInterface(newState);
    if (onShowAddInterface) {
      onShowAddInterface(newState);
    }
  };

  return (
    <div className="form-card">
      <div className="form-header">
        <div className="form-title-section">
          <button
            className="expand-collapse-btn"
            onClick={handleToggleCollapse}
            title={isExpanded ? 'Collapse form' : 'Expand form'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          
          {isEditing ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="form-title-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
              autoFocus
            />
          ) : (
            <h3 
              className="form-title"
              onClick={() => setIsEditing(true)}
              title="Click to edit title"
            >
              {form.title || 'Untitled Form'}
            </h3>
          )}
          
          <span className="form-type-badge">Form</span>
        </div>

        <div className="form-actions">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="save-btn"
                title="Save changes"
              >
                {isSaving ? '💾' : '✓'}
              </button>
              <button
                onClick={handleCancel}
                className="cancel-btn"
                title="Cancel editing"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleToggleAI}
                className={`ai-btn ${form.isInAIContext ? 'active' : ''}`}
                title={form.isInAIContext ? 'Remove from AI context' : 'Add to AI context'}
              >
                🤖
              </button>
              <button
                onClick={handleAddPageClick}
                className={`add-page-btn ${localShowAddInterface ? 'active' : ''}`}
                title="Add page below this form"
              >
                +
              </button>
              <button
                onClick={handleRemove}
                className="remove-btn"
                title="Remove form from workspace"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="form-content">
          {isEditing ? (
            <div className="form-edit-mode">
              <div className="edit-help">
                <h4>Form DSL Editor</h4>
                <p>Edit the YAML form definition below. Changes will be saved automatically.</p>
              </div>
              <textarea
                className="form-content-textarea"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder="Enter form DSL here..."
                rows={12}
              />
            </div>
          ) : (
            <div className="form-content-display">
              {form.content && form.content.trim() ? (
                <FormRenderer 
                  form={form}
                  workspaceId={workspaceId}
                  onFormUpdate={onWorkspaceUpdate}
                />
              ) : (
                <div className="form-placeholder">
                  <div className="placeholder-icon">📝</div>
                  <h4>Empty Form</h4>
                  <p>This form doesn't have any DSL content yet.</p>
                  <p>Click "Edit Form" to add interactive blocks using YAML DSL.</p>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="edit-form-btn"
                  >
                    Edit Form DSL
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FormCard;
