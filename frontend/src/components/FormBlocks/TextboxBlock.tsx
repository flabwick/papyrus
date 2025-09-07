import React from 'react';

interface TextboxBlockProps {
  block: {
    id: string;
    label: string;
    value: string;
    required: boolean;
    style: 'single' | 'multi';
    placeholder: string;
  };
  formState: any;
  onStateChange: (blockId: string, value: any) => void;
}

const TextboxBlock: React.FC<TextboxBlockProps> = ({ 
  block, 
  formState, 
  onStateChange 
}) => {
  const currentValue = formState[block.id]?.value || block.value || '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onStateChange(block.id, {
      value: e.target.value,
      type: 'textbox'
    });
  };

  const inputProps = {
    id: `textbox-${block.id}`,
    value: currentValue,
    onChange: handleChange,
    placeholder: block.placeholder,
    required: block.required,
    className: `form-textbox ${block.style === 'multi' ? 'multi-line' : 'single-line'}`
  };

  return (
    <div className="form-block textbox-block" data-block-id={block.id}>
      <label htmlFor={`textbox-${block.id}`} className="textbox-label">
        {block.label}
        {block.required && <span className="required-indicator">*</span>}
      </label>
      
      {block.style === 'multi' ? (
        <textarea
          {...inputProps}
          rows={4}
        />
      ) : (
        <input
          type="text"
          {...inputProps}
        />
      )}
      
      {block.required && !currentValue.trim() && (
        <div className="validation-error">
          This field is required
        </div>
      )}
    </div>
  );
};

export default TextboxBlock;
