import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';

interface GenerateInterfaceProps {
  libraryId: string;
  position: number;
  onGenerate: (prompt: string, model: string, position: number) => void;
  onCancel: () => void;
  contextCards?: string[];
}

const GenerateInterface: React.FC<GenerateInterfaceProps> = ({
  libraryId,
  position,
  onGenerate,
  onCancel,
  contextCards = []
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load available AI models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await api.get('/ai/models');
        const models = response.data.models || [];
        setAvailableModels(models);
        
        // Set first available model as default
        if (models.length > 0) {
          setSelectedModel(models[0].id);
        }
      } catch (error) {
        console.error('Failed to load AI models:', error);
        // Fallback to simulated models if API fails
        setAvailableModels([
          { id: 'simulation', name: 'Simulation Mode', provider: 'local' }
        ]);
        setSelectedModel('simulation');
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModels();
  }, []);

  const handleGenerate = () => {
    if (prompt.trim()) {
      onGenerate(prompt.trim(), selectedModel, position);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="generate-interface" style={{
      padding: '12px',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      backgroundColor: '#f9fafb',
      margin: '8px 0'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        fontSize: '12px',
        color: '#6b7280'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoadingModels}
            style={{
              fontSize: '12px',
              padding: '2px 4px',
              border: '1px solid #d1d5db',
              borderRadius: '4px'
            }}
          >
            {isLoadingModels ? (
              <option value="">Loading models...</option>
            ) : availableModels.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))
            )}
          </select>
          <span>Context: {contextCards.length} cards</span>
        </div>
      </div>
      
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter your prompt... (Ctrl+Enter to generate)"
        style={{
          width: '100%',
          minHeight: '80px',
          padding: '8px',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          fontSize: '14px',
          resize: 'vertical',
          marginBottom: '8px'
        }}
        autoFocus
      />
      
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-small"
          onClick={onCancel}
          style={{ fontSize: '12px' }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          style={{ fontSize: '12px' }}
        >
          Generate
        </button>
      </div>
    </div>
  );
};

export default GenerateInterface;