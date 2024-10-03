import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

export async function downloadFile(url: string, dest: string, apiKey: string) {
  await fs.ensureDir(path.dirname(dest));
  const writer = fs.createWriteStream(dest);

  const response = await axios.get(url, {
    responseType: 'stream',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  response.data.pipe(writer);

  return new Promise<void>((resolve, reject) => {
    writer.on('finish', () => {
      resolve();
    });
    writer.on('error', (err: any) => {
      fs.unlink(dest).catch(() => {});
      reject(err);
    });
  });
}
