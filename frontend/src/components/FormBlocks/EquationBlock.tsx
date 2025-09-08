import React, { useEffect, useRef } from 'react';
import { render as katexRender } from 'katex';
import 'katex/dist/katex.min.css';

interface EquationBlockProps {
  block: {
    id: string;
    equation: string;
    label?: string;
    display?: boolean; // true for block display, false for inline
    visibility: string;
  };
}

const EquationBlock: React.FC<EquationBlockProps> = ({ block }) => {
  const equationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (equationRef.current && block.equation) {
      try {
        katexRender(block.equation, equationRef.current, {
          displayMode: block.display !== false, // Default to display mode
          throwOnError: false,
          errorColor: '#cc0000',
          strict: false
        });
      } catch (error) {
        console.error('KaTeX rendering error:', error);
        if (equationRef.current) {
          equationRef.current.innerHTML = `<span style="color: #cc0000;">Error rendering equation: ${block.equation}</span>`;
        }
      }
    }
  }, [block.equation, block.display]);

  if (block.visibility === 'hidden') {
    return null;
  }

  return (
    <div className="form-block equation-block" data-block-id={block.id}>
      {block.label && (
        <div className="equation-block-label">
          {block.label}
        </div>
      )}
      <div 
        className={`equation-content ${block.display !== false ? 'display-mode' : 'inline-mode'}`}
        ref={equationRef}
        style={{
          padding: block.display !== false ? '16px' : '8px',
          textAlign: block.display !== false ? 'center' : 'left',
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '4px',
          margin: '8px 0'
        }}
      />
      <div className="equation-source" style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
        LaTeX: <code>{block.equation}</code>
      </div>
    </div>
  );
};

export default EquationBlock;
