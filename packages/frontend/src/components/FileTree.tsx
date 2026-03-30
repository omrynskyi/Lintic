import { useState } from 'react';

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onFileCreate: (name: string) => void;
  onFileDelete: (path: string) => void;
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        fill="#519aba"
        d="M3 1.5A1.5 1.5 0 014.5 0h5.793L13 2.707V14.5A1.5 1.5 0 0111.5 16h-7A1.5 1.5 0 013 14.5v-13zm1.5-.5a.5.5 0 00-.5.5v13a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V3h-2.5A.5.5 0 019 2.5V1H4.5z"
      />
      <path fill="#519aba" fillOpacity={0.6} d="M9 1l3 3H9V1z" />
    </svg>
  );
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

  const sortedFiles = Object.keys(files).sort();

  return (
    <div
      className="flex flex-col h-full shrink-0 overflow-hidden select-none"
      style={{ width: '200px', background: '#252526' }}
    >
      {/* Explorer header */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{ height: '35px', borderBottom: '1px solid #3c3c3c' }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: '#bbbbbb' }}
        >
          Explorer
        </span>
        <button
          aria-label="New File"
          title="New File"
          className="flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: '#8a8a8a' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#d4d4d4'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8a8a8a'; }}
          onClick={() => setIsCreating(true)}
        >
          {/* New file icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H9V2H4v11h4v1H3.5l-.5-.5v-12l.5-.5h5.7l.3.1zM10 2v3h2.9L10 2zm4 11h-2v-2H11v2H9v1h2v2h1v-2h2v-1z"/>
          </svg>
        </button>
      </div>

      {/* File list */}
      <ul role="listbox" className="flex-1 overflow-y-auto py-1">
        {/* Inline creation input — appears at top of list like VSCode */}
        {isCreating && (
          <li className="flex items-center gap-2 px-3 py-[3px]" style={{ paddingLeft: '12px' }}>
            <FileIcon />
            <input
              autoFocus
              type="text"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              style={{
                color: '#d4d4d4',
                borderBottom: '1px solid #007acc',
                paddingBottom: '1px',
              }}
              placeholder="filename.ts"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') cancelCreate();
              }}
              onBlur={submitCreate}
            />
          </li>
        )}

        {sortedFiles.map((path) => {
          const isActive = path === activeFile;
          return (
            <li
              key={path}
              role="option"
              aria-selected={isActive}
              aria-label={path}
              className="flex items-center gap-2 py-[3px] cursor-pointer group"
              style={{
                paddingLeft: '10px',
                paddingRight: '6px',
                background: isActive ? '#37373d' : undefined,
                color: isActive ? '#d4d4d4' : '#9d9d9d',
                borderLeft: isActive ? '2px solid #007acc' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLLIElement).style.background = '#2a2d2e';
                  (e.currentTarget as HTMLLIElement).style.color = '#d4d4d4';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLLIElement).style.background = '';
                  (e.currentTarget as HTMLLIElement).style.color = '#9d9d9d';
                }
              }}
              onClick={() => onFileSelect(path)}
            >
              <FileIcon />
              <span className="text-xs truncate flex-1">{path}</span>
              <button
                aria-label={`Delete ${path}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded"
                style={{ color: '#6a6a6a', padding: '1px' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f48771'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#6a6a6a'; }}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileDelete(path);
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
