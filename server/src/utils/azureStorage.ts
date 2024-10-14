import { BlobServiceClient } from '@azure/storage-blob';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME =
  process.env.AZURE_STORAGE_CONTAINER_NAME || 'images';

// Initialize BlobServiceClient
if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error(
    'AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables.'
  );
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);

// Ensure the container exists
export async function getContainerClient(containerName: 'images' | 'books') {
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
