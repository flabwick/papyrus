import React from 'react';

interface TextBlockProps {
  block: {
    id: string;
    content: string;
    visibility: string;
  };
}

const TextBlock: React.FC<TextBlockProps> = ({ block }) => {
  if (block.visibility === 'hidden') {
    return null;
  }

  // Simple markdown-like processing for bold text
  const processContent = (content: string) => {
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };

  return (
    <div className="form-block text-block" data-block-id={block.id}>
      <div 
        className="text-block-content"
        dangerouslySetInnerHTML={{ 
          __html: processContent(block.content) 
        }}
      />
    </div>
  );
};

export default TextBlock;
