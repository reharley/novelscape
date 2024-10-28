import { GenerationData } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
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
    embeddings,
    negative_embeddings,
    model,
    removeBackground: doRemoveBackground,
  } = data;

  try {
    // Fetch current model options from Stable Diffusion WebUI API
    const optionsResponse = await makeRequest('/sdapi/v1/options', 'GET');
    const currentModel = optionsResponse?.data?.sd_model_checkpoint;

    // If the selected model is different from the current model, set it as active
    if (model && model !== currentModel) {
      await makeRequest('/sdapi/v1/options', 'POST', {
        sd_model_checkpoint: model,
      });
    }

    // Retrieve LORA data from the WebUI API
    const loraResponse = await makeRequest('/sdapi/v1/loras', 'GET');
    if (!loraResponse?.data) throw new Error('Could not retrieve LORA data.');
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
    // Send request to Stable Diffusion WebUI API
    const response = await makeRequest('/sdapi/v1/txt2img', 'POST', {
      prompt: finalPrompt,
      negative_prompt: negative_prompt || '',
      steps: steps || 20,
      width: width || 512,
      height: height || 512,
    });

    if (!response?.data?.images || response.data.images.length === 0)
      throw new Error('No images returned from Stable Diffusion.');
    let imageBase64: string = response.data.images[0];

    if (doRemoveBackground) {
      const image = await removeImageBackground(imageBase64);
      if (image) imageBase64 = image;
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

    return { imageUrl };
  } catch (error: any) {
    console.error(
      'Error generating image:',
      error.response?.data || error.message
    );
    throw new Error('An error occurred while generating the image.');
  }
}
async function removeImageBackground(
  encodedImage: string
): Promise<string | null> {
  const apiUrl = '/rembg'; // Replace with your API URL

  const payload = {
    input_image: encodedImage,
    // model: 'u2net', // You can change the model if needed
    // return_mask: false,
    // alpha_matting: false,
    // alpha_matting_foreground_threshold: 240,
    // alpha_matting_background_threshold: 10,
    // alpha_matting_erode_size: 10,
  };

  try {
    const response = await makeRequest(apiUrl, 'POST', payload);
    if (!response) {
      console.error('Failed to remove background:', response);
      return null;
    }

    if (response.status === 200 && response.data.image) {
      return response.data.image; // base64-encoded string of the result image
    } else {
      console.error('Failed to remove background:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Error during API request:', error);
    return null;
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

async function makeRequest(
  endpoint: string,
  actionType: 'GET' | 'POST',
  requestBody?: Record<string, any>
) {
  const SD_API_URL = process.env.SD_API_URL || 'http://localhost:7860';

  try {
    const isLocalhost = !SD_API_URL.includes('runpod');

    if (isLocalhost) {
      const requestUrl = `${SD_API_URL}${endpoint}`;
      if (actionType === 'GET') {
        return await axios.get(requestUrl);
      } else if (actionType === 'POST') {
        return await axios.post(requestUrl, requestBody);
      }
    } else {
      const body = {
        input: {
          method: actionType,
          url: `http://127.0.0.1:7860${endpoint}`,
          ...(actionType === 'POST' && { body: requestBody }),
        },
      };
      const config: AxiosRequestConfig = {
        headers: {
          Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
        },
      };
      const response = await axios.post(SD_API_URL, body, config);
      return { ...response, data: response.data.output };
    }
  } catch (error) {
    console.error(`Error with ${actionType} request to ${endpoint}:`, error);
    throw error;
  }
}
