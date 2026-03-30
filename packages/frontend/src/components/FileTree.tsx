import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface FileTreeProps {
  files: Record<string, string>;
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onFileCreate: (name: string) => void;
  onFileDelete: (path: string) => void;
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        fill="#3a6a8a"
        d="M3 1.5A1.5 1.5 0 014.5 0h5.793L13 2.707V14.5A1.5 1.5 0 0111.5 16h-7A1.5 1.5 0 013 14.5v-13zm1.5-.5a.5.5 0 00-.5.5v13a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V3h-2.5A.5.5 0 019 2.5V1H4.5z"
      />
      <path fill="#3a6a8a" fillOpacity={0.5} d="M9 1l3 3H9V1z" />
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
      style={{ width: '200px', background: '#0e0e0e' }}
    >
      {/* Explorer header */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{ height: '36px' }}
      >
        <span
          className="text-[9px] font-semibold uppercase tracking-widest"
          style={{ color: '#333333' }}
        >
          Explorer
        </span>
        <button
          aria-label="New File"
          title="New File"
          className="flex items-center justify-center w-5 h-5 rounded transition-colors"
          style={{ color: '#333333' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#888888'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#333333'; }}
          onClick={() => setIsCreating(true)}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H9V2H4v11h4v1H3.5l-.5-.5v-12l.5-.5h5.7l.3.1zM10 2v3h2.9L10 2zm4 11h-2v-2H11v2H9v1h2v2h1v-2h2v-1z"/>
          </svg>
        </button>
      </div>

      {/* File list */}
      <ul role="listbox" className="flex-1 overflow-y-auto">
        {/* Inline creation input */}
        <AnimatePresence>
          {isCreating && (
            <motion.li
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="flex items-center gap-2 py-[3px]"
              style={{ paddingLeft: '12px', paddingRight: '8px' }}
            >
              <FileIcon />
              <input
                autoFocus
                type="text"
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
                style={{
                  color: '#aaaaaa',
                  borderBottom: '1px solid #1a4a7a',
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
            </motion.li>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sortedFiles.map((path) => {
            const isActive = path === activeFile;
            return (
              <motion.li
                key={path}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                role="option"
                aria-selected={isActive}
                aria-label={path}
                className="flex items-center gap-2 py-[3px] cursor-pointer group"
                style={{
                  paddingLeft: isActive ? '10px' : '12px',
                  paddingRight: '6px',
                  background: isActive ? '#161616' : undefined,
                  color: isActive ? '#bbbbbb' : '#4a4a4a',
                  borderLeft: isActive ? '2px solid #1a4a7a' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLLIElement).style.background = '#111111';
                    (e.currentTarget as HTMLLIElement).style.color = '#888888';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLLIElement).style.background = '';
                    (e.currentTarget as HTMLLIElement).style.color = '#4a4a4a';
                  }
                }}
                onClick={() => onFileSelect(path)}
              >
                <FileIcon />
                <span className="text-xs truncate flex-1">{path}</span>
                <button
                  aria-label={`Delete ${path}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: '#333333', padding: '1px' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#884444'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#333333'; }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileDelete(path);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z" />
                  </svg>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
