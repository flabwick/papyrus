import React, { useState, useRef, useCallback } from 'react';
import api from '../services/api';

interface FileUploadInterfaceProps {
  brainId: string;
  streamId: string;
  position: number;
  onFileUploaded: (fileCard: any) => void;
  onCancel: () => void;
}

interface UploadingFile {
  file: File;
  id: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  cardId?: string;
  message?: string;
}

const FileUploadInterface: React.FC<FileUploadInterfaceProps> = ({
  brainId,
  streamId,
  position,
  onFileUploaded,
  onCancel
}) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedTypes = [
    'application/pdf',
    'application/epub+zip'
  ];

  const maxFileSize = 100 * 1024 * 1024; // 100MB

  const validateFile = (file: File): string | null => {
    if (!supportedTypes.includes(file.type)) {
      return `Unsupported file type: ${file.type}. Only PDF and EPUB files are supported.`;
    }
    
    if (file.size > maxFileSize) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 100MB.`;
    }
    
    return null;
  };

  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  const uploadFile = async (file: File) => {
    const fileId = generateFileId();
    
    const uploadingFile: UploadingFile = {
      file,
      id: fileId,
      progress: 0,
      status: 'uploading'
    };

    setUploadingFiles(prev => [...prev, uploadingFile]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('brainId', brainId);
      formData.append('streamId', streamId);
      formData.append('position', position.toString());

      // Upload file with progress tracking
      const response = await api.post('/cards/upload-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total 
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          
          setUploadingFiles(prev => 
            prev.map(f => 
              f.id === fileId 
                ? { ...f, progress, status: progress === 100 ? 'processing' : 'uploading' }
                : f
            )
          );
        }
      });

      // File uploaded successfully, now wait for processing
      const { cardId, fileName, wasRenamed, finalTitle, originalTitle } = response.data.data;
      const message = response.data.message;
      
      setUploadingFiles(prev => 
        prev.map(f => 
          f.id === fileId 
            ? { 
                ...f, 
                status: 'complete', 
                cardId,
                message: wasRenamed ? `Renamed to "${finalTitle}"` : 'Upload complete'
              }
            : f
        )
      );

      // Show rename notification if needed
      if (wasRenamed) {
        console.log(`📝 File card renamed: "${originalTitle}" → "${finalTitle}"`);
      }

      // Notify parent component
      setTimeout(() => {
        onFileUploaded({
          id: cardId,
          fileName,
          fileType: file.type.includes('pdf') ? 'pdf' : 'epub',
          fileSize: file.size,
          finalTitle,
          wasRenamed
        });
      }, 1000); // Small delay to show completion

    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
      
      setUploadingFiles(prev => 
        prev.map(f => 
          f.id === fileId 
            ? { ...f, status: 'error', error: errorMessage }
            : f
        )
      );
    }
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        alert(`Error with ${file.name}: ${error}`);
        continue;
      }
      
      await uploadFile(file);
    }
  }, [brainId, streamId, position]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileIcon = (file: File): string => {
    if (file.type === 'application/pdf') return '📄';
    if (file.type === 'application/epub+zip') return '📚';
    return '📁';
  };

  const getStatusIcon = (status: UploadingFile['status']): string => {
    switch (status) {
      case 'uploading': return '📤';
      case 'processing': return '⚙️';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '📁';
    }
  };

  const getStatusText = (uploadingFile: UploadingFile): string => {
    switch (uploadingFile.status) {
      case 'uploading': return `Uploading... ${uploadingFile.progress}%`;
      case 'processing': return 'Processing file...';
      case 'complete': return uploadingFile.message || 'Upload complete!';
      case 'error': return uploadingFile.error || 'Upload failed';
      default: return 'Waiting...';
    }
  };

  const allComplete = uploadingFiles.length > 0 && uploadingFiles.every(f => f.status === 'complete');

  return (
    <div className="file-upload-interface" style={{
      border: '2px dashed #d1d5db',
      borderRadius: '8px',
      padding: '24px',
      margin: '12px 0',
      backgroundColor: dragOver ? '#f3f4f6' : '#fafbfc',
      transition: 'all 0.2s ease',
      borderColor: dragOver ? '#3b82f6' : '#d1d5db'
    }}>
      
      {/* Upload zone */}
      <div
        className="upload-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          textAlign: 'center',
          cursor: 'pointer',
          padding: '20px',
          borderRadius: '4px',
          backgroundColor: dragOver ? '#eff6ff' : 'transparent'
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>
          {dragOver ? '📤' : '📁'}
        </div>
        <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>
          {dragOver ? 'Drop files here' : 'Upload PDF or EPUB files'}
        </h3>
        <p style={{ margin: '0 0 16px 0', color: '#6b7280', fontSize: '14px' }}>
          Drag and drop files here, or click to select files
        </p>
        <p style={{ margin: '0', color: '#9ca3af', fontSize: '12px' }}>
          Supported: PDF, EPUB • Maximum size: 100MB per file
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {/* Upload progress */}
      {uploadingFiles.length > 0 && (
        <div className="upload-progress" style={{ marginTop: '16px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
            Uploading Files ({uploadingFiles.length})
          </h4>
          
          {uploadingFiles.map((uploadingFile) => (
            <div key={uploadingFile.id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px',
              margin: '4px 0',
              backgroundColor: '#f9fafb',
              borderRadius: '4px',
              border: uploadingFile.status === 'error' ? '1px solid #fecaca' : '1px solid #e5e7eb'
            }}>
              <div style={{ marginRight: '8px', fontSize: '16px' }}>
                {getFileIcon(uploadingFile.file)}
              </div>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {uploadingFile.file.name}
                </div>
                
                <div style={{ 
                  fontSize: '11px',
                  color: '#6b7280',
                  marginBottom: '4px'
                }}>
                  {formatFileSize(uploadingFile.file.size)} • {getStatusText(uploadingFile)}
                </div>
                
                {uploadingFile.status === 'uploading' && (
                  <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${uploadingFile.progress}%`,
                      height: '100%',
                      backgroundColor: '#3b82f6',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                )}
              </div>
              
              <div style={{ marginLeft: '8px', fontSize: '16px' }}>
                {getStatusIcon(uploadingFile.status)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e5e7eb'
      }}>
        <button
          type="button"
          className="btn btn-small"
          onClick={onCancel}
          disabled={uploadingFiles.some(f => f.status === 'uploading')}
        >
          {allComplete ? 'Close' : 'Cancel'}
        </button>
        
        {uploadingFiles.length === 0 && (
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Files
          </button>
        )}
        
        {allComplete && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload More
          </button>
        )}
      </div>
    </div>
  );
};

export default FileUploadInterface;