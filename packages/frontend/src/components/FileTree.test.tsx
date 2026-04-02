import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { FileTree, buildRenderTree } from './FileTree.js';

const FILES = { 'index.ts': 'const x = 1;', 'App.tsx': '' };

function renderFileTree(overrides: Partial<ComponentProps<typeof FileTree>> = {}) {
  const props: ComponentProps<typeof FileTree> = {
    files: FILES,
    directories: [],
    activeFile: 'index.ts',
    onFileSelect: vi.fn(),
    onFileCreate: vi.fn(),
    onFolderCreate: vi.fn(),
    onFileDelete: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };

  return render(<FileTree {...props} />);
}

describe('FileTree', () => {
  test('renders all filenames', () => {
    renderFileTree();
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  test('active file has aria-selected=true', () => {
    renderFileTree();
    expect(screen.getByRole('option', { name: 'index.ts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'App.tsx' })).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a filename calls onFileSelect', () => {
    const onFileSelect = vi.fn();
    renderFileTree({ activeFile: null, onFileSelect });

    fireEvent.click(screen.getByRole('option', { name: 'App.tsx' }));
    expect(onFileSelect).toHaveBeenCalledWith('App.tsx');
  });

  test('clicking delete button calls onFileDelete', () => {
    const onFileDelete = vi.fn();
    renderFileTree({ activeFile: null, onFileDelete });

    fireEvent.click(screen.getByRole('button', { name: /delete index\.ts/i }));
    expect(onFileDelete).toHaveBeenCalledWith('index.ts');
  });

  test('shows inline input when New file is clicked', () => {
    renderFileTree({ files: {}, activeFile: null });

    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('pressing Enter in the input calls onFileCreate and hides input', () => {
    const onFileCreate = vi.fn();
    renderFileTree({ files: {}, activeFile: null, onFileCreate });

    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'utils.ts' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onFileCreate).toHaveBeenCalledWith('utils.ts');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('pressing Escape cancels creation without calling onFileCreate', () => {
    const onFileCreate = vi.fn();
    renderFileTree({ files: {}, activeFile: null, onFileCreate });

    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(onFileCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('does not call onFileCreate when input is empty', () => {
    const onFileCreate = vi.fn();
    renderFileTree({ files: {}, activeFile: null, onFileCreate });

    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onFileCreate).not.toHaveBeenCalled();
  });

  test('renders folder nodes for nested files', () => {
    renderFileTree({
      files: { 'src/index.ts': '', 'src/App.tsx': '' },
      directories: ['src'],
      activeFile: null,
    });

    expect(screen.getByTestId('folder-node')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'src' })).toBeInTheDocument();
  });

  test('folder children are hidden until clicked', () => {
    renderFileTree({
      files: { 'src/index.ts': '' },
      directories: ['src'],
      activeFile: null,
    });

    expect(screen.queryByRole('option', { name: 'src/index.ts' })).toBeNull();

    fireEvent.click(screen.getByTestId('folder-node'));
    expect(screen.getByRole('option', { name: 'src/index.ts' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('folder-node'));
    expect(screen.queryByRole('option', { name: 'src/index.ts' })).toBeNull();
  });

  test('clicking a nested file calls onFileSelect with full path', () => {
    const onFileSelect = vi.fn();
    renderFileTree({
      files: { 'src/utils.ts': '' },
      directories: ['src'],
      activeFile: null,
      onFileSelect,
    });

    fireEvent.click(screen.getByTestId('folder-node'));
    fireEvent.click(screen.getByRole('option', { name: 'src/utils.ts' }));
    expect(onFileSelect).toHaveBeenCalledWith('src/utils.ts');
  });
});

describe('buildRenderTree', () => {
  test('filters out node_modules paths', () => {
    const tree = buildRenderTree({
      'index.ts': '',
      'node_modules/react/index.js': '',
      'src/node_modules/foo/bar.js': '',
    }, []);

    const allPaths = (nodes: ReturnType<typeof buildRenderTree>): string[] =>
      nodes.flatMap((n) => [n.path, ...allPaths(n.children)]);

    const paths = allPaths(tree);
    expect(paths).toContain('index.ts');
    expect(paths.every((p) => !p.includes('node_modules'))).toBe(true);
  });

  test('filters out .git paths', () => {
    const tree = buildRenderTree({
      'index.ts': '',
      '.git/HEAD': '',
      '.git/config': '',
    }, []);

    const allPaths = (nodes: ReturnType<typeof buildRenderTree>): string[] =>
      nodes.flatMap((n) => [n.path, ...allPaths(n.children)]);

    const paths = allPaths(tree);
    expect(paths.every((p) => !p.includes('.git'))).toBe(true);
  });

  test('directories sort before files', () => {
    const tree = buildRenderTree({ 'z.ts': '', 'a/b.ts': '' }, []);
    expect(tree[0]!.isDir).toBe(true);
    expect(tree[1]!.isDir).toBe(false);
  });
});
