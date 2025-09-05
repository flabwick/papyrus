import React, { useState } from 'react';
import FileSearchInterface from './FileSearchInterface';
import FileUploadInterface from './FileUploadInterface';

interface FileAddInterfaceProps {
  libraryId: string;
  workspaceId: string;
  position: number;
  onFileSelected: (file: any) => void;
  onFileUploaded: (filePage: any) => void;
  onCancel: () => void;
}

const FileAddInterface: React.FC<FileAddInterfaceProps> = ({
  libraryId,
  workspaceId,
  position,
  onFileSelected,
  onFileUploaded,
  onCancel
}) => {
  const [showUpload, setShowUpload] = useState(false);

  if (showUpload) {
    return (
      <div className="file-add-interface">
        <div className="interface-header">
          <button
            onClick={() => setShowUpload(false)}
            className="back-btn"
            title="Back to file search"
          >
            ← Back to Search
          </button>
        </div>
        <FileUploadInterface
          libraryId={libraryId}
          streamId={workspaceId}
          position={position}
          onFileUploaded={onFileUploaded}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className="file-add-interface">
      <div className="interface-header">
        <div className="interface-title">
          <span className="interface-icon">📁</span>
          Add File to Workspace
        </div>
        <div className="interface-actions">
          <button
            onClick={() => setShowUpload(true)}
            className="btn btn-small btn-primary"
            title="Upload new file"
          >
            📤 Import
          </button>
          <button
            onClick={onCancel}
            className="cancel-btn"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      </div>
      <FileSearchInterface
        libraryId={libraryId}
        workspaceId={workspaceId}
        onFileSelected={onFileSelected}
        onCancel={onCancel}
      />
    </div>
  );
};

export default FileAddInterface;
