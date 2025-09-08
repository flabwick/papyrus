import React from 'react';
import ReactMarkdown from 'react-markdown';

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

  return (
    <div className="form-block text-block markdown-block" data-block-id={block.id}>
      <div className="markdown-content">
        <ReactMarkdown>{block.content}</ReactMarkdown>
      </div>
    </div>
  );
};

export default TextBlock;
