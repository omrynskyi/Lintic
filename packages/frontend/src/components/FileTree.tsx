import { useState } from 'react';

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onFileCreate: (name: string) => void;
  onFileDelete: (path: string) => void;
}

export function FileTree({ files, activeFile, onFileSelect, onFileCreate, onFileDelete }: FileTreeProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed) onFileCreate(trimmed);
    setIsCreating(false);
    setNewName('');
  }

  function cancelCreate() {
    setIsCreating(false);
    setNewName('');
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-48 shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Files</span>
        <button
          aria-label="New File"
          className="text-gray-400 hover:text-gray-100 text-lg leading-none"
          onClick={() => setIsCreating(true)}
        >
          +
        </button>
      </div>

      <ul role="listbox" className="flex-1 py-1">
        {Object.keys(files).sort().map((path) => (
          <li
            key={path}
            role="option"
            aria-selected={path === activeFile}
            aria-label={path}
            className={`flex items-center justify-between px-3 py-1 cursor-pointer text-xs group ${
              path === activeFile
                ? 'bg-gray-800 text-gray-100'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
            onClick={() => onFileSelect(path)}
          >
            <span className="truncate">{path}</span>
            <button
              aria-label={`Delete ${path}`}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 ml-1 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onFileDelete(path);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {isCreating && (
        <div className="px-2 py-1 border-t border-gray-800">
          <input
            autoFocus
            type="text"
            className="w-full bg-gray-800 text-gray-100 text-xs px-2 py-1 rounded outline-none border border-blue-500"
            placeholder="filename.ts"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') cancelCreate();
            }}
            onBlur={submitCreate}
          />
        </div>
      )}
    </div>
  );
}
