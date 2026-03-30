import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { FileTree } from './FileTree.js';

const FILES = { 'index.ts': 'const x = 1;', 'App.tsx': '' };

describe('FileTree', () => {
  test('renders all filenames', () => {
    render(
      <FileTree
        files={FILES}
        activeFile="index.ts"
        onFileSelect={vi.fn()}
        onFileCreate={vi.fn()}
        onFileDelete={vi.fn()}
      />
    );
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  test('active file has aria-selected=true', () => {
    render(
      <FileTree
        files={FILES}
        activeFile="index.ts"
        onFileSelect={vi.fn()}
        onFileCreate={vi.fn()}
        onFileDelete={vi.fn()}
      />
    );
    expect(screen.getByRole('option', { name: 'index.ts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'App.tsx' })).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a filename calls onFileSelect', () => {
    const onFileSelect = vi.fn();
    render(
      <FileTree
        files={FILES}
        activeFile={null}
        onFileSelect={onFileSelect}
        onFileCreate={vi.fn()}
        onFileDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('option', { name: 'App.tsx' }));
    expect(onFileSelect).toHaveBeenCalledWith('App.tsx');
  });

  test('clicking delete button calls onFileDelete', () => {
    const onFileDelete = vi.fn();
    render(
      <FileTree
        files={FILES}
        activeFile={null}
        onFileSelect={vi.fn()}
        onFileCreate={vi.fn()}
        onFileDelete={onFileDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /delete index\.ts/i }));
    expect(onFileDelete).toHaveBeenCalledWith('index.ts');
  });

  test('shows inline input when New File is clicked', () => {
    render(
      <FileTree
        files={{}}
        activeFile={null}
        onFileSelect={vi.fn()}
        onFileCreate={vi.fn()}
        onFileDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('pressing Enter in the input calls onFileCreate and hides input', () => {
    const onFileCreate = vi.fn();
    render(
      <FileTree
        files={{}}
        activeFile={null}
        onFileSelect={vi.fn()}
        onFileCreate={onFileCreate}
        onFileDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'utils.ts' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onFileCreate).toHaveBeenCalledWith('utils.ts');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('pressing Escape cancels creation without calling onFileCreate', () => {
    const onFileCreate = vi.fn();
    render(
      <FileTree
        files={{}}
        activeFile={null}
        onFileSelect={vi.fn()}
        onFileCreate={onFileCreate}
        onFileDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onFileCreate).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('does not call onFileCreate when input is empty', () => {
    const onFileCreate = vi.fn();
    render(
      <FileTree
        files={{}}
        activeFile={null}
        onFileSelect={vi.fn()}
        onFileCreate={onFileCreate}
        onFileDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /new file/i }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onFileCreate).not.toHaveBeenCalled();
  });
});
