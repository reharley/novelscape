import { BlobServiceClient } from '@azure/storage-blob';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING;
// Initialize BlobServiceClient
if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error(
    'AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables.'
  );
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);

export type ContainerName = 'images' | 'books';

// Ensure the container exists
export async function getContainerClient(containerName: ContainerName) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const exists = await containerClient.exists();
  if (!exists) {
    await containerClient.create({ access: 'container' }); // Public access
    console.log(`Container "${containerName}" created.`);
  }
  return containerClient;
}

export const uploadFileToAzure = async (
  buffer: Buffer,
  filename: string
): Promise<string> => {
  const blobName = uuidv4() + path.extname(filename); // Unique file name
  const containerClient = await getContainerClient('books');
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  // Upload buffer to Azure Blob
  await blockBlobClient.uploadData(buffer);

  // Return the URL of the uploaded file
  return blockBlobClient.url;
};

export async function downloadFileFromAzure(
  blobUrl: string,
  containerName: ContainerName,
  filePath: string
) {
  // Parse the blob URL to extract the container and blob names
  const url = new URL(blobUrl);
  const pathParts = url.pathname.split('/');
  const blobName = pathParts.slice(2).join('/');

  // Get the container client
  const containerClient = await getContainerClient(containerName);

  // Get the blob client
  const blobClient = containerClient.getBlobClient(blobName);

  // Download the blob content
  const downloadResponse = await blobClient.downloadToFile(filePath);
}

// Helper function to convert a readable stream to a buffer
async function streamToBuffer(
  readableStream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => {
      chunks.push(data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}
