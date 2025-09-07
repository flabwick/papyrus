import React, { useState } from 'react';

interface ButtonBlockProps {
  block: {
    id: string;
    text: string;
    disabled: boolean;
    actionType: string;
    workspaceOperation: {
      type: string;
      title?: string;
      content?: string;
      prompt?: string;
      count?: number;
    };
  };
  formState: any;
  workspaceId: string;
  formId: string;
  onExecute: (blockId: string, operation: any) => Promise<void>;
}

const ButtonBlock: React.FC<ButtonBlockProps> = ({ 
  block, 
  formState, 
  workspaceId,
  formId,
  onExecute 
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const isDisabled = block.disabled || 
    formState[block.id]?.disabled || 
    isExecuting;

  const handleClick = async () => {
    if (isDisabled) return;

    setIsExecuting(true);
    try {
      await onExecute(block.id, block.workspaceOperation);
      setLastResult({ success: true, timestamp: Date.now() });
    } catch (error: unknown) {
      console.error('Button execution error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Operation failed';
      setLastResult({ 
        success: false, 
        error: errorMessage,
        timestamp: Date.now() 
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getButtonText = () => {
    if (isExecuting) {
      return block.workspaceOperation.type === 'create_card' ? 'Creating...' : 'Generating...';
    }
    return block.text;
  };

  const getButtonIcon = () => {
    if (isExecuting) return '⏳';
    if (lastResult?.success) return '✅';
    if (lastResult?.success === false) return '❌';
    
    switch (block.workspaceOperation.type) {
      case 'create_card': return '📄';
      case 'generate': return '🤖';
      default: return '';
    }
  };

  return (
    <div className="form-block button-block" data-block-id={block.id}>
      <button
        className={`form-button ${isDisabled ? 'disabled' : ''} ${isExecuting ? 'executing' : ''}`}
        onClick={handleClick}
        disabled={isDisabled}
        title={isDisabled ? 'Button is disabled' : `Execute ${block.workspaceOperation.type}`}
      >
        <span className="button-icon">{getButtonIcon()}</span>
        <span className="button-text">{getButtonText()}</span>
      </button>
      
      {lastResult && (
        <div className={`operation-result ${lastResult.success ? 'success' : 'error'}`}>
          {lastResult.success ? (
            <span>✅ Operation completed successfully</span>
          ) : (
            <span>❌ {lastResult.error}</span>
          )}
        </div>
      )}
      
      {/* Show operation preview */}
      <div className="operation-preview">
        <small>
          {block.workspaceOperation.type === 'create_card' && (
            <>Will create: "{block.workspaceOperation.title}"</>
          )}
          {block.workspaceOperation.type === 'generate' && (
            <>Will generate from prompt</>
          )}
        </small>
      </div>
    </div>
  );
};

export default ButtonBlock;
