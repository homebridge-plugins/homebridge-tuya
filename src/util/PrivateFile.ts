import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/** Replace a JSON file atomically, without following an existing file or temporary-file symlink. */
export async function writePrivateJson(file: string, value: unknown): Promise<void> {
  const contents = JSON.stringify(value, null, 2);
  if (contents === undefined) {
    throw new TypeError('A private JSON file must contain a JSON value.');
  }
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(16).toString('hex')}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(contents + '\n', 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    });
  }
}
