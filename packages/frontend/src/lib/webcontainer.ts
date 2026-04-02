import { WebContainer } from '@webcontainer/api';

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    try {
      const wc = await WebContainer.boot();
      instance = wc;
      return wc;
    } catch (err) {
      bootPromise = null; // Allow retry on failure
      throw err;
    }
  })();

  return bootPromise;
}

export async function writeFile(path: string, content: string): Promise<void> {
  const wc = await getWebContainer();
  await wc.fs.writeFile(path, content);
}

export async function readFile(path: string): Promise<string> {
  const wc = await getWebContainer();
  return wc.fs.readFile(path, 'utf-8');
}

export async function duplicate(path: string): Promise<string> {
  const content = await readFile(path);
  const parts = path.split('.');
  const ext = parts.pop();
  const newPath = `${parts.join('.')}-copy.${ext}`;
  await writeFile(newPath, content);
  return newPath;
}

export async function mkdir(path: string): Promise<void> {
  const wc = await getWebContainer();
  await wc.fs.mkdir(path, { recursive: true });
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  const wc = await getWebContainer();
  await wc.fs.rename(oldPath, newPath);
}

export async function rm(path: string): Promise<void> {
  const wc = await getWebContainer();
  await wc.fs.rm(path, { recursive: true, force: true });
}

export async function watchFiles(
  path: string,
  listener: (event: string, filename: string | Uint8Array) => void,
): Promise<() => void> {
  const wc = await getWebContainer();
  const watcher = wc.fs.watch(path, { recursive: true }, listener);
  return () => watcher.close();
}

/** Only for use in tests — resets singleton state between test cases. */
export function resetForTests(): void {
  instance = null;
  bootPromise = null;
}
