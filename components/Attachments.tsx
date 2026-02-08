import React, { useCallback, useRef } from 'react';
import { X, File, FileCode, FileText, Image, FileArchive } from 'lucide-react';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  path?: string;
  content?: string;        // Text content for text files
  base64Data?: string;     // Base64 data for images
}

interface AttachmentsProps {
  attachments: Attachment[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

// Get icon based on file type
function getFileIcon(filename: string, mimeType: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // Code files
  const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt', 'scala', 'sh', 'bash', 'sql', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss', 'less', 'md', 'toml', 'ini'];
  if (codeExtensions.includes(ext)) {
    return <FileCode size={16} className="text-blue-500" />;
  }

  // Image files
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <Image size={16} className="text-purple-500" />;
  }

  // Archive files
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
    return <FileArchive size={16} className="text-amber-500" />;
  }

  // Text files
  if (mimeType.startsWith('text/') || ['txt', 'log', 'csv'].includes(ext)) {
    return <FileText size={16} className="text-gray-500" />;
  }

  return <File size={16} className="text-gray-400" />;
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const Attachments: React.FC<AttachmentsProps> = ({
  attachments,
  onAdd,
  onRemove,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onAdd(files);
    }
    // Reset input to allow selecting the same file again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onAdd]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onAdd(files);
    }
  }, [onAdd, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Hidden file input
  const FileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      onChange={handleFileChange}
      className="hidden"
      disabled={disabled}
    />
  );

  // Trigger file selection
  const triggerFileSelect = useCallback(() => {
    inputRef.current?.click();
  }, []);

  if (attachments.length === 0) {
    return (
      <>
        {FileInput}
        <button
          type="button"
          onClick={triggerFileSelect}
          disabled={disabled}
          className="hidden"
          data-attachment-trigger
        />
      </>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {FileInput}

      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg group hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
        >
          {getFileIcon(attachment.name, attachment.type)}
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[150px]">
              {attachment.name}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {formatSize(attachment.size)}
            </span>
          </div>
          <button
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Add more button */}
      <button
        onClick={triggerFileSelect}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
      >
        <File size={14} />
        Add file
      </button>
    </div>
  );
};

// Export trigger function for external use
export const triggerAttachmentSelect = () => {
  const trigger = document.querySelector('[data-attachment-trigger]') as HTMLButtonElement;
  trigger?.click();
};

export default Attachments;
