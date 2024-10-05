import { BlobServiceClient } from '@azure/storage-blob';
import removeBackground from '@imgly/background-removal-node';
import axios from 'axios';
import path from 'path';
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
async function getContainerClient() {
  const containerClient = blobServiceClient.getContainerClient(
    AZURE_STORAGE_CONTAINER_NAME
  );
  const exists = await containerClient.exists();
  if (!exists) {
    await containerClient.create({ access: 'container' }); // Public access
    console.log(`Container "${AZURE_STORAGE_CONTAINER_NAME}" created.`);
  }
  return containerClient;
}

interface GenerateImageParams {
  prompt: string;
  negative_prompt?: string | null;
  steps?: number;
  width?: number;
  height?: number;
  loras?: string[];
  model?: string;
  removeBackground?: boolean;
}
/**
 * Generates an image based on the provided parameters, uploads it to Azure Blob Storage,
 * and returns the URL of the uploaded image.
 *
 * @param data - The parameters for image generation.
 * @returns An object containing the image URL.
 */
export async function generateImage(
  data: GenerateImageParams
): Promise<{ imageUrl: string }> {
  const {
    prompt,
    negative_prompt,
    steps,
    width,
    height,
    loras,
    model,
    removeBackground: doRemoveBackground,
  } = data;

  try {
    // Fetch current model options from Stable Diffusion WebUI API
    const optionsResponse = await axios.get(
      'http://localhost:7860/sdapi/v1/options'
    );
    const currentModel = optionsResponse.data.sd_model_checkpoint;

    // If the selected model is different from the current model, set it as active
    if (model && model !== currentModel) {
      await axios.post('http://localhost:7860/sdapi/v1/options', {
        sd_model_checkpoint: model,
      });
    }

    // Retrieve LORA data from the WebUI API
    const loraResponse = await axios.get(
      'http://localhost:7860/sdapi/v1/loras'
    );
    const loraData = loraResponse.data; // Assuming this is an array of LORA objects

    // Create a mapping from filename to alias
    const filenameToAliasMap: { [key: string]: string } = {};
    for (const lora of loraData) {
      const filename = path.basename(lora.path);
      const alias = lora.alias;
      filenameToAliasMap[filename] = alias;
    }

    // Construct prompt with correct LORA references
    let finalPrompt = prompt;
    if (loras && loras.length > 0) {
      const loraPrompts = loras.map((loraFilename: string) => {
        const loraAlias = filenameToAliasMap[loraFilename];
        if (loraAlias) {
          return `<lora:${loraAlias}:1>`;
        } else {
          console.warn(`LORA alias not found for filename: ${loraFilename}`);
          return '';
        }
      });
      finalPrompt = `${loraPrompts.join(' ')} ${prompt}`;
    }

    // Send request to Stable Diffusion WebUI API
    const response = await axios.post(
      'http://localhost:7860/sdapi/v1/txt2img',
      {
        prompt: finalPrompt,
        negative_prompt: negative_prompt || '',
        steps: steps || 20,
        width: width || 512,
        height: height || 512,
        // Include other parameters as needed
      }
    );

    let imageBase64: string = response.data.images[0]; // Assuming a single image is returned
    if (doRemoveBackground) {
      const imageBlob = base64ToBlob(imageBase64);
      const blob = await removeBackground(imageBlob, {
        debug: false,
        progress: () => {},
        model: 'small',
        output: { quality: 0.8, format: 'image/png' },
      });
      imageBase64 = await blobToBase64(blob);
    }
    // Convert Base64 string to Buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Generate a unique filename (e.g., using timestamp and random number)
    const timestamp = Date.now();
    const randomInt = Math.floor(Math.random() * 1000);
    const filename = `image_${timestamp}_${randomInt}.png`;

    // Get container client
    const containerClient = await getContainerClient();

    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(filename);

    // Upload the image buffer
    await blockBlobClient.uploadData(imageBuffer, {
      blobHTTPHeaders: { blobContentType: 'image/png' },
    });

    // Generate the blob URL
    const imageUrl = blockBlobClient.url;

    console.log(`Image uploaded to Azure Blob Storage: ${imageUrl}`);

    return { imageUrl };
  } catch (error: any) {
    console.error(
      'Error generating image:',
      error.response?.data || error.message
    );
    throw new Error('An error occurred while generating the image.');
  }
}

/**
 * Converts a Blob to a Base64 encoded string in Node.js.
 *
 * @param blob - The Blob object to convert.
 * @returns A Promise that resolves to a Base64 encoded string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  // Step 1: Get the ArrayBuffer from the Blob
  const arrayBuffer = await blob.arrayBuffer();

  // Step 2: Convert ArrayBuffer to Buffer
  const buffer = Buffer.from(arrayBuffer);

  // Step 3: Convert Buffer to Base64 string
  const base64String = buffer.toString('base64');

  return base64String;
}
/**
 * Converts a Base64 string to a Blob in Node.js.
 *
 * @param base64 - The Base64 encoded string.
 * @param mimeType - (Optional) The MIME type of the resulting Blob. Defaults to 'application/octet-stream'.
 * @returns A Promise that resolves to a Blob representing the decoded data.
 */
function base64ToBlob(
  base64: string,
  mimeType: string = 'application/octet-stream'
): Blob {
  // Decode the Base64 string into a Buffer
  const buffer = Buffer.from(base64, 'base64');

  // Convert Buffer to an ArrayBuffer
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteLength + buffer.byteOffset
  );

  // Create a Blob from the ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: mimeType });

  return blob;
}
