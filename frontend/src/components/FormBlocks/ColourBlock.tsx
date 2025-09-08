import React from 'react';

interface ColourBlockProps {
  block: {
    id: string;
    colour: string;
    label?: string;
    height?: number;
    visibility: string;
  };
}

const ColourBlock: React.FC<ColourBlockProps> = ({ block }) => {
  if (block.visibility === 'hidden') {
    return null;
  }

  const height = block.height || 40; // Default height of 40px
  const colour = block.colour || '#cccccc'; // Default to light gray

  return (
    <div className="form-block colour-block" data-block-id={block.id}>
      {block.label && (
        <div className="colour-block-label">
          {block.label}
        </div>
      )}
      <div 
        className="colour-bar"
        style={{
          backgroundColor: colour,
          height: `${height}px`,
          width: '100%',
          borderRadius: '4px',
          border: '1px solid rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: getContrastColor(colour),
          fontSize: '12px',
          fontWeight: '500'
        }}
        title={`Colour: ${colour}`}
      >
        {colour}
      </div>
    </div>
  );
};

// Helper function to determine if text should be light or dark based on background
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export default ColourBlock;
