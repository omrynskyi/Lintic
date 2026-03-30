import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WebContainer } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

interface Props {
  wc: WebContainer | null;
}

export function Terminal({ wc }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      theme: { background: '#0c0c0c', foreground: '#d4d4d4', cursor: '#569cd6' },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!wc || !termRef.current) return;
    const term = termRef.current;
    let cleanup: (() => void) | undefined;

    void wc
      .spawn('jsh', { terminal: { cols: term.cols, rows: term.rows } })
      .then((process) => {
        const inputWriter = process.input.getWriter();
        const onData = term.onData((data) => {
          void inputWriter.write(data);
        });

        const reader = process.output.getReader();
        let active = true;
        function pump() {
          void reader.read().then(({ done, value }) => {
            if (done || !active) return;
            term.write(value);
            pump();
          });
        }
        pump();

        cleanup = () => {
          active = false;
          onData.dispose();
          void inputWriter.close().catch(() => {});
        };
      });

    return () => cleanup?.();
  }, [wc]);

  return (
    <div
      data-testid="terminal-container"
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0c0c0c', padding: '4px 8px' }}
    />
  );
}
