import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { TabBar } from './TabBar.js';

describe('TabBar', () => {
  test('renders a button for each open tab', () => {
    render(
      <TabBar
        tabs={['index.ts', 'App.tsx']}
        activeTab="index.ts"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
      />
    );
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
  });

  test('active tab has active styling (aria-selected=true)', () => {
    render(
      <TabBar
        tabs={['index.ts', 'App.tsx']}
        activeTab="index.ts"
        onTabSelect={vi.fn()}
        onTabClose={vi.fn()}
      />
    );
    const active = screen.getByRole('tab', { name: /index\.ts/ });
    expect(active).toHaveAttribute('aria-selected', 'true');
    const inactive = screen.getByRole('tab', { name: /App\.tsx/ });
    expect(inactive).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a tab calls onTabSelect with that path', () => {
    const onTabSelect = vi.fn();
    render(
      <TabBar
        tabs={['index.ts', 'App.tsx']}
        activeTab="index.ts"
        onTabSelect={onTabSelect}
        onTabClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: /App\.tsx/ }));
    expect(onTabSelect).toHaveBeenCalledWith('App.tsx');
  });

  test('clicking close button calls onTabClose with that path', () => {
    const onTabClose = vi.fn();
    render(
      <TabBar
        tabs={['index.ts']}
        activeTab="index.ts"
        onTabSelect={vi.fn()}
        onTabClose={onTabClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /close index\.ts/i }));
    expect(onTabClose).toHaveBeenCalledWith('index.ts');
  });

  test('renders nothing when tabs is empty', () => {
    const { container } = render(
      <TabBar tabs={[]} activeTab={null} onTabSelect={vi.fn()} onTabClose={vi.fn()} />
    );
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });
});
