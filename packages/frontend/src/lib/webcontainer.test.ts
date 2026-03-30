import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFs = {
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('file-content'),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
};

const mockWc = { fs: mockFs };

vi.mock('@webcontainer/api', () => ({
  WebContainer: { boot: vi.fn().mockResolvedValue(mockWc) },
}));

const { getWebContainer, writeFile, readFile, watchFiles, resetForTests } =
  await import('./webcontainer.js');

beforeEach(() => {
  resetForTests();
  vi.clearAllMocks();
  mockFs.writeFile.mockResolvedValue(undefined);
  mockFs.readFile.mockResolvedValue('file-content');
  mockFs.watch.mockReturnValue({ close: vi.fn() });
});

describe('getWebContainer', () => {
  it('boots once and returns the same instance', async () => {
    const { WebContainer } = await import('@webcontainer/api');
    const a = await getWebContainer();
    const b = await getWebContainer();
    expect(a).toBe(b);
    expect(() => WebContainer.boot()).toHaveBeenCalledTimes(1);
  });
});

describe('writeFile', () => {
  it('writes content to the WebContainer filesystem', async () => {
    await writeFile('/index.ts', 'const x = 1;');
    expect(mockFs.writeFile).toHaveBeenCalledWith('/index.ts', 'const x = 1;');
  });
});

describe('readFile', () => {
  it('reads content from the WebContainer filesystem', async () => {
    const content = await readFile('/index.ts');
    expect(content).toBe('file-content');
    expect(mockFs.readFile).toHaveBeenCalledWith('/index.ts', 'utf-8');
  });
});

describe('watchFiles', () => {
  it('registers a watch on the given path and returns a cleanup function', async () => {
    const listener = vi.fn();
    const close = vi.fn();
    mockFs.watch.mockReturnValue({ close });

    const stop = await watchFiles('/', listener);
    expect(mockFs.watch).toHaveBeenCalledWith('/', { recursive: true }, listener);

    stop();
    expect(close).toHaveBeenCalled();
  });
});
