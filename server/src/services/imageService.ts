import removeBackground from '@imgly/background-removal-node';
import { GenerationData } from '@prisma/client';
import axios from 'axios';
import path from 'path';
import prisma from '../config/prisma.js';
import { getContainerClient } from '../utils/azureStorage.js';

interface GenerateImageParams {
  prompt: string;
  negative_prompt?: string | null;
  steps?: number;
  width?: number;
  height?: number;
  positive_loras?: { name: string; weight: number }[];
  negative_loras?: { name: string; weight: number }[];
  embeddings?: string[];
  negative_embeddings?: string[];
  model: string;
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
  data: GenerateImageParams,
  generationData?: GenerationData
): Promise<{ imageUrl: string }> {
  const {
    prompt,
    negative_prompt,
    steps,
    width,
    height,
    positive_loras,
    negative_loras,
    embeddings,
    negative_embeddings,
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
    let finalNegativePrompt = negative_prompt || '';

    // Handle embeddings
    if (embeddings && embeddings.length > 0) {
      finalPrompt = `${embeddings.join(' ')} ${finalPrompt}`;
    }
    if (negative_embeddings && negative_embeddings.length > 0) {
      finalNegativePrompt = `${negative_embeddings.join(
        ' '
      )} ${finalNegativePrompt}`;
    }

    // Handle LoRAs
    if (positive_loras && positive_loras.length > 0) {
      const loraPrompts = positive_loras.map(
        (lora) => `<lora:${lora.name}:${lora.weight}>`
      );
      finalPrompt = `${loraPrompts.join(' ')} ${finalPrompt}`;
    }
    if (negative_loras && negative_loras.length > 0) {
      const negativeLoraPrompts = negative_loras.map(
        (lora) => `<lora:${lora.name}:${lora.weight}>`
      );
      finalNegativePrompt = `${negativeLoraPrompts.join(
        ' '
      )} ${finalNegativePrompt}`;
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
      //@ts-ignore
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
    const containerClient = await getContainerClient('images');

    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(filename);

    // Upload the image buffer
    await blockBlobClient.uploadData(imageBuffer, {
      blobHTTPHeaders: { blobContentType: 'image/png' },
    });

    // Generate the blob URL
    const imageUrl = blockBlobClient.url;
    const resources: { name: string; weight: number }[] = [];
    if (embeddings)
      resources.push(...embeddings.map((e) => ({ name: e, weight: 1 })));
    if (positive_loras) resources.push(...positive_loras);
    if (generationData)
      await associateModelResources(generationData, resources, model);

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

async function associateModelResources(
  generationData: GenerationData,
  resources: { name: string; weight: number }[],
  modelFileName: string
) {
  const resourceNames = resources.map((r) => r.name);
  resourceNames.push(modelFileName);
  const aiModels = await prisma.aiModel.findMany({
    where: { fileName: { in: resourceNames } },
  });

  if (aiModels.length === 0) {
    return;
  }

  const existingResources = await prisma.civitaiResource.findMany({
    where: { generationDataId: generationData.id },
  });
  const existingModelIds = existingResources.map((r) => r.modelId);
  const newModels = aiModels.filter(
    (m) => !existingModelIds.includes(m.modelId)
  );

  await prisma.civitaiResource.createMany({
    data: newModels.map((aiModel) => ({
      baseModel: aiModel.baseModel,
      modelType: aiModel.type,
      versionId: -1,
      modelId: aiModel.modelId,
      modelName: aiModel.name,
      versionName: '',
      generationDataId: generationData.id,
    })),
  });
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
