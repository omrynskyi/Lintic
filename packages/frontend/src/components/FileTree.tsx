import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  FilePlus, 
  FolderPlus, 
  ChevronLeft, 
  ChevronRight, 
  File, 
  Folder, 
  X, 
  ChevronDown,
  Edit2,
  Trash2,
  Copy,
  FileText,
  ClipboardList
} from 'lucide-react';
import { ContextMenu, ContextMenuItem } from './ContextMenu.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileTreeProps {
  files: Record<string, string>;
  directories: string[];
  activeFile: string | null;
  onFileSelect: (path: string) => void;
  onFileCreate: (name: string) => void;
  onFolderCreate: (name: string) => void;
  onFileDelete: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDuplicate: (path: string) => void;
  onMove: (oldPath: string, newPath: string) => void;
}

interface RenderNode {
  name: string;
  path: string;
  isDir: boolean;
  children: RenderNode[];
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

const IGNORED = ['node_modules', '.git', '.DS_Store'];

function isPlansRoot(path: string): boolean {
  return path === 'plans';
}

export function buildRenderTree(files: Record<string, string>, directories: string[]): RenderNode[] {
  const filePaths = Object.keys(files).filter(
    (p) => !p.split('/').some((seg) => IGNORED.includes(seg)),
  );
  
  const allPaths = Array.from(new Set([...filePaths, ...directories]));

  const dirSet = new Set<string>();
  for (const p of allPaths) {
    const segs = p.split('/');
    // Add all parent directories to the set
    for (let i = 1; i < segs.length; i++) {
      dirSet.add(segs.slice(0, i).join('/'));
    }
  }

  // A path is a directory if it's in our explicit directories list OR if it's a parent of another path
  const isActuallyDir = (p: string) => directories.includes(p) || dirSet.has(p);

  type INode = { isDir: boolean; path: string; children: Map<string, INode> };

  function insert(map: Map<string, INode>, segs: string[], depth: number) {
    const seg = segs[depth]!;
    const isLast = depth === segs.length - 1;
    const nodePath = segs.slice(0, depth + 1).join('/');
    
    if (!map.has(seg)) {
      map.set(seg, { 
        isDir: !isLast || isActuallyDir(nodePath), 
        path: nodePath, 
        children: new Map() 
      });
    }
    if (!isLast) insert(map.get(seg)!.children, segs, depth + 1);
  }

  const root = new Map<string, INode>();
  for (const fp of allPaths) insert(root, fp.split('/'), 0);

  function toArr(map: Map<string, INode>): RenderNode[] {
    return [...map.entries()]
      .map(([name, node]) => ({
        name,
        path: node.path,
        isDir: node.isDir,
        children: node.isDir ? toArr(node.children) : [],
      }))
      .sort((a, b) => {
        if (isPlansRoot(a.path) !== isPlansRoot(b.path)) {
          return isPlansRoot(a.path) ? -1 : 1;
        }
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  return toArr(root);
}

// ─── Tree node renderer ───────────────────────────────────────────────────────

interface NodeProps {
  node: RenderNode;
  depth: number;
  activeFile: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onFileSelect: (path: string) => void;
  onFileDelete: (path: string) => void;
  onFolderSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  renamingPath: string | null;
  onRenameSubmit: (newName: string) => void;
  onRenameCancel: () => void;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent, path: string, isDir: boolean) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetPath: string, isDir: boolean) => void;
}

function TreeNode({ 
  node, depth, activeFile, expanded, onToggle, onFileSelect, onFileDelete, onFolderSelect, 
  onContextMenu, renamingPath, onRenameSubmit, onRenameCancel,
  onDragStart, onDragOver, onDragLeave, onDrop
}: NodeProps) {
  const indent = 16 + depth * 12;
  const isOpen = expanded.has(node.path);
  const isRenaming = renamingPath === node.path;
  const [newName, setNewName] = useState(node.name);

  // Sync internal name if node changes externally
  useEffect(() => {
    setNewName(node.name);
  }, [node.name]);

  if (node.isDir) {
    const folderIcon = isPlansRoot(node.path)
      ? <ClipboardList size={14} className="text-[#7DD3FC] opacity-90" />
      : <Folder size={14} className="text-[var(--color-icon-folder)] opacity-80" />;

    return (
      <div
        onDragOver={(e) => onDragOver(e, node.path, true)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node.path, true)}
      >
        <div
          className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-[var(--color-surface-subtle)] transition-colors group"
          style={{ paddingLeft: `${indent}px`, paddingRight: '12px' }}
          role="button"
          aria-label={node.path}
          aria-expanded={isOpen}
          data-testid="folder-node"
          onClick={() => {
            onToggle(node.path);
            onFolderSelect(node.path);
          }}
          onContextMenu={(e) => onContextMenu(e, node.path, true)}
          draggable
          onDragStart={(e) => onDragStart(e, node.path)}
        >
          <span className="text-[var(--color-text-dim)]">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          {folderIcon}
          {isRenaming ? (
            <input
              autoFocus
              className="flex-1 rounded bg-[var(--color-surface-muted)] px-1 text-[13px] outline-none text-[var(--color-text-main)]"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit(newName);
                if (e.key === 'Escape') onRenameCancel();
              }}
              onBlur={() => onRenameSubmit(newName)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-[13px] text-[var(--color-text-main)] font-medium truncate">{node.name}</span>
          )}
        </div>
        {isOpen &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              expanded={expanded}
              onToggle={onToggle}
              onFileSelect={onFileSelect}
              onFileDelete={onFileDelete}
              onFolderSelect={onFolderSelect}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ))}
      </div>
    );
  }

  const isActive = node.path === activeFile;
  const fileIcon = node.path.startsWith('plans/')
    ? <FileText size={14} className="text-[#93C5FD] opacity-85" />
    : <File size={14} className="text-[var(--color-icon-file)] opacity-60" />;
  return (
    <div
      className={`flex items-center gap-2 py-1.5 cursor-pointer group transition-colors ${
        isActive ? 'bg-[var(--color-bg-active-node)]' : 'hover:bg-[var(--color-surface-subtle)]'
      }`}
      role="option"
      aria-label={node.path}
      aria-selected={isActive}
      style={{
        paddingLeft: `${indent + 20}px`,
        paddingRight: '12px',
      }}
      onClick={() => onFileSelect(node.path)}
      onContextMenu={(e) => onContextMenu(e, node.path, false)}
      draggable
      onDragStart={(e) => onDragStart(e, node.path)}
      onDragOver={(e) => onDragOver(e, node.path, false)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, node.path, false)}
    >
      {fileIcon}
      {isRenaming ? (
        <input
          autoFocus
          className="flex-1 rounded bg-[var(--color-surface-muted)] px-1 text-[13px] outline-none text-[var(--color-text-main)]"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameSubmit(newName);
            if (e.key === 'Escape') onRenameCancel();
          }}
          onBlur={() => onRenameSubmit(newName)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`text-[13px] truncate flex-1 ${isActive ? 'text-[var(--color-text-bold)] font-bold' : 'text-[var(--color-text-main)]'}`}>
          {node.name}
        </span>
      )}
      {!isRenaming && (
        <button
          type="button"
          aria-label={`Delete ${node.path}`}
          onClick={(e) => {
            e.stopPropagation();
            onFileDelete(node.path);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-[var(--color-surface-muted)] rounded"
        >
          <X size={12} className="text-[var(--color-text-dim)]" />
        </button>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FileTree({ 
  files, 
  directories, 
  activeFile, 
  onFileSelect, 
  onFileCreate, 
  onFolderCreate, 
  onFileDelete,
  onRename,
  onDuplicate,
  onMove
}: FileTreeProps) {
  const [createType, setCreateType] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [focusedFolder, setFocusedFolder] = useState<string | null>(null);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, isDir: boolean } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const tree = buildRenderTree(files, directories);

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function submitCreate() {
    const trimmed = newName.trim();
    if (trimmed) {
      const path = focusedFolder ? `${focusedFolder}/${trimmed}` : trimmed;
      if (createType === 'file') onFileCreate(path);
      else if (createType === 'folder') {
        onFolderCreate(path);
        setExpanded(prev => new Set(prev).add(path));
      }
    }
    setCreateType(null);
    setNewName('');
  }

  function handleContextMenu(e: React.MouseEvent, path: string, isDir: boolean) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }

  function handleRenameSubmit(newName: string) {
    if (renamingPath && newName && newName !== renamingPath.split('/').pop()) {
      const parts = renamingPath.split('/');
      parts[parts.length - 1] = newName;
      onRename(renamingPath, parts.join('/'));
    }
    setRenamingPath(null);
  }

  // Drag and Drop handlers
  const dragPath = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, path: string) {
    dragPath.current = path;
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a ghost image or just let default happen
    const ghost = document.createElement('div');
    ghost.style.display = 'none';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
  }

  function handleDragOver(e: React.DragEvent, targetPath: string, isDir: boolean) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragPath.current || dragPath.current === targetPath) return;
    
    // Check if target is descendant of dragged (invalid)
    if (targetPath && targetPath.startsWith(dragPath.current + '/')) return;

    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-muted)';
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).style.backgroundColor = '';
  }

  function handleDrop(e: React.DragEvent, targetPath: string, isDir: boolean) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).style.backgroundColor = '';
    
    if (!dragPath.current || dragPath.current === targetPath) return;
    
    // Determine target directory
    const targetDir = isDir ? targetPath : targetPath.split('/').slice(0, -1).join('/');
    const fileName = dragPath.current.split('/').pop()!;
    const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (newPath !== dragPath.current) {
      onMove(dragPath.current, newPath);
    }
    dragPath.current = null;
  }

  const menuItems: ContextMenuItem[] = contextMenu ? [
    { 
      label: 'Rename', 
      icon: <Edit2 size={14} />, 
      onClick: () => setRenamingPath(contextMenu.path) 
    },
    { 
      label: 'Duplicate', 
      icon: <Copy size={14} />, 
      onClick: () => onDuplicate(contextMenu.path) 
    },
    { 
      label: 'Delete', 
      icon: <Trash2 size={14} />, 
      danger: true, 
      onClick: () => onFileDelete(contextMenu.path) 
    },
  ] : [];

  return (
    <motion.div
      layout
      initial={false}
      animate={{ width: isCollapsed ? '48px' : '220px' }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full shrink-0 overflow-hidden select-none relative"
      style={{ background: 'var(--color-bg-sidebar)' }}
      onClick={() => setFocusedFolder(null)}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => handleDrop(e, '', true)}
    >
      {/* Explorer header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: '48px' }}
      >
        {!isCollapsed && (
          <motion.span 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[14px] font-bold text-[var(--color-text-dim)]"
          >
            Files
          </motion.span>
        )}
        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-4' : 'gap-2'}`}>
          {!isCollapsed && (
            <>
              <button 
                type="button"
                aria-label="New file"
                onClick={(e) => { e.stopPropagation(); setCreateType('file'); }} 
                className="p-1 hover:bg-[var(--color-surface-subtle)] rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]"
              >
                <FilePlus size={16} />
              </button>
              <button 
                type="button"
                aria-label="New folder"
                onClick={(e) => { e.stopPropagation(); setCreateType('folder'); }}
                className="p-1 hover:bg-[var(--color-surface-subtle)] rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]"
              >
                <FolderPlus size={16} />
              </button>
            </>
          )}
          <button 
            type="button"
            aria-label={isCollapsed ? 'Expand file tree' : 'Collapse file tree'}
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
            className="p-1 hover:bg-[var(--color-surface-subtle)] rounded text-[var(--color-text-dim)] hover:text-[var(--color-text-main)]"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {/* File list */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            {createType && (
              <div 
                className="flex items-center gap-2 py-1.5 bg-[var(--color-surface-subtle)]"
                style={{ paddingLeft: focusedFolder ? `${(focusedFolder.split('/').length + 1) * 12 + 16}px` : '16px' }}
                onClick={(e) => e.stopPropagation()}
              >
                {createType === 'file' ? (
                  <File size={14} className="text-[var(--color-icon-file)]" />
                ) : (
                  <Folder size={14} className="text-[var(--color-icon-folder)]" />
                )}
                <input
                  autoFocus
                  type="text"
                  className="flex-1 min-w-0 bg-transparent text-[13px] outline-none text-[var(--color-text-main)]"
                  placeholder={createType === 'file' ? "filename.ts" : "folder name"}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCreate();
                    if (e.key === 'Escape') setCreateType(null);
                  }}
                  onBlur={submitCreate}
                />
              </div>
            )}

            <div className="py-2" onClick={(e) => e.stopPropagation()}>
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  activeFile={activeFile}
                  expanded={expanded}
                  onToggle={toggleDir}
                  onFileSelect={onFileSelect}
                  onFileDelete={onFileDelete}
                  onFolderSelect={setFocusedFolder}
                  onContextMenu={handleContextMenu}
                  renamingPath={renamingPath}
                  onRenameSubmit={handleRenameSubmit}
                  onRenameCancel={() => setRenamingPath(null)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          items={menuItems} 
          onClose={() => setContextMenu(null)} 
        />
      )}
    </motion.div>
  );
}
