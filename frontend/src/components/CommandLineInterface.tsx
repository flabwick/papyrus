import React, { useState, useRef, useEffect } from 'react';

interface CommandLineInterfaceProps {
  onUploadFile: () => void;
  onNewPage: () => void;
  onGenerate: () => void;
  onAddPage: () => void;
  onAddFile: () => void;
  onAddForm: () => void;
}

interface Command {
  name: string;
  description: string;
  action: () => void;
}

const CommandLineInterface: React.FC<CommandLineInterfaceProps> = ({
  onUploadFile,
  onNewPage,
  onGenerate,
  onAddPage,
  onAddFile,
  onAddForm,
}) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      name: '/upload',
      description: 'Upload a new file (PDF or EPUB)',
      action: onUploadFile,
    },
    {
      name: '/new',
      description: 'Create a new page',
      action: onNewPage,
    },
    {
      name: '/generate',
      description: 'Generate content with AI',
      action: onGenerate,
    },
    {
      name: '/add',
      description: 'Add an existing page',
      action: onAddPage,
    },
    {
      name: '/file',
      description: 'Add an existing file',
      action: onAddFile,
    },
    {
      name: '/form',
      description: 'Create a new form card',
      action: onAddForm,
    },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(input.toLowerCase()) ||
    cmd.description.toLowerCase().includes(input.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    
    if (value.startsWith('/') && value.length > 1) {
      setShowSuggestions(true);
      setSelectedSuggestion(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setInput(filteredCommands[selectedSuggestion].name + ' ');
        setShowSuggestions(false);
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInput('');
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleSubmit = () => {
    const command = input.trim().split(' ')[0].toLowerCase();
    const exactMatch = commands.find(cmd => cmd.name === command);
    
    if (exactMatch) {
      // Execute exact match
      exactMatch.action();
      setInput('');
      setShowSuggestions(false);
    } else if (filteredCommands.length > 0 && input.startsWith('/')) {
      // Auto-complete to the most likely command (first in filtered list)
      const autoCompleteCommand = filteredCommands[selectedSuggestion] || filteredCommands[0];
      autoCompleteCommand.action();
      setInput('');
      setShowSuggestions(false);
    } else if (input.trim()) {
      // Show error or handle unknown command
      console.log('Unknown command:', command);
      setInput('');
    }
  };

  const handleSuggestionClick = (command: Command) => {
    command.action();
    setInput('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Focus input when component mounts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus input when user types '/' anywhere
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        setInput('/');
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="command-line-interface">
      {/* Suggestions dropdown */}
      {showSuggestions && filteredCommands.length > 0 && (
        <div className="command-suggestions">
          {filteredCommands.map((command, index) => (
            <div
              key={command.name}
              className={`command-suggestion ${index === selectedSuggestion ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(command)}
            >
              <span className="command-name">{command.name}</span>
              <span className="command-description">{command.description}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Input field */}
      <div className="command-input-container">
        <span className="command-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type / for commands or enter text..."
          className="command-input"
          autoComplete="off"
          spellCheck={false}
        />
        {input && (
          <button
            type="button"
            className="command-submit"
            onClick={handleSubmit}
          >
            ↵
          </button>
        )}
      </div>
    </div>
  );
};

export default CommandLineInterface;
