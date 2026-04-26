import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Sidebar } from './Sidebar.js';

describe('Sidebar', () => {
  test('marks the active workspace section and emits selections', () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        activeSection="database"
        onSelect={onSelect}
        isDark={false}
        onToggleTheme={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Database' })).toHaveStyle({
      background: 'var(--color-bg-active-node)',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Curl' }));

    expect(onSelect).toHaveBeenCalledWith('code');
    expect(onSelect).toHaveBeenCalledWith('curl');
  });

  test('renders the theme toggle in the sidebar footer', () => {
    const onToggleTheme = vi.fn();
    render(
      <Sidebar
        activeSection="code"
        onSelect={() => undefined}
        isDark={true}
        onToggleTheme={onToggleTheme}
      />,
    );

    fireEvent.click(screen.getByTestId('sidebar-theme-toggle'));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});
