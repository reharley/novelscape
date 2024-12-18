import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import prisma from '../config/prisma.js';
import { downloadFile } from '../utils/downloadFile.js';

const SD_API_URL = process.env.SD_API_URL || 'http://localhost:7860';

export async function listModels(type: string, profileId?: string) {
  if (profileId) {
    return await prisma.aiModel.findMany({
      where: {
        type,
        profiles: {
          some: {
            profileId: Number(profileId),
          },
        },
      },
    });
  }
  return await prisma.aiModel.findMany({
    where: { type },
  });
}

export async function loadModel(modelId: string, skipLoadModel = false) {
  const basePath = process.env.MODEL_PATH;
  const civitaiApiToken = process.env.CIVITAI_API_TOKEN;
  if (!basePath) {
    throw new Error('Model path not configured.');
  }
  if (!civitaiApiToken) {
    throw new Error('CivitAI API key not configured.');
  }
  // Fetch model details from CivitAI
  const modelResponse = await axios.get(
    `https://civitai.com/api/v1/models/${modelId}`
  );
  const modelData = modelResponse.data;

  // Determine the model type
  const modelType = modelData.type; // "Checkpoint", "LORA", "TextualInversion", etc.

  // Get the latest version of the model
  const modelVersion = modelData.modelVersions[0];

  // Find the appropriate file to download based on type
  let modelFile = modelVersion.files.find((file: any) => {
    // Adjust the conditions based on the file types and formats you expect
    return (
      (file.type === 'Model' ||
        file.type === 'Pruned Model' ||
        file.type === 'LORA') &&
      (file.format === 'SafeTensor' || file.format === 'PickleTensor')
    );
  });

  // If no suitable file found, look for any available file
  if (!modelFile) {
    modelFile = modelVersion.files.find((file: any) => true); // Fallback to any file
  }

  if (!modelFile) {
    throw new Error('Model file not found.');
  }

  const modelUrl = modelFile.downloadUrl;
  const modelFileName = modelFile.name;

  // Include API Key in Headers
  const apiKey = civitaiApiToken;
  if (!apiKey) {
    throw new Error('CivitAI API key not configured.');
  }

  // Determine the correct save path based on model type
  let modelPath: string;
  let refreshEndpoint: string | null = null;

  switch (modelType.toLowerCase()) {
    case 'checkpoint':
      modelPath = path.join(
        basePath,
        'models/Stable-diffusion/',
        modelFileName
      );
      refreshEndpoint = '/sdapi/v1/refresh-checkpoints';
      break;
    case 'textualinversion':
      modelPath = path.join(basePath, 'embeddings/', modelFileName);
      refreshEndpoint = '/sdapi/v1/refresh-embeddings';
      break;
    case 'lora':
      modelPath = path.join(basePath, 'models/Lora/', modelFileName);
      // No refresh endpoint needed for LORA
      break;
    // Add cases for other model types if necessary
    default:
      throw new Error('Unsupported model type.');
  }

  // Check if the model file already exists
  if (fs.existsSync(modelPath)) {
    console.log('Model already exists:', modelPath);
    refreshEndpoint = null; // No need to refresh if model already exists
  } else {
    // Download the model file
    await downloadFile(modelUrl, modelPath, apiKey);
  }

  // Refresh models in Stable Diffusion WebUI if necessary
  if (refreshEndpoint && !skipLoadModel) {
    await axios.post(`${SD_API_URL}${refreshEndpoint}`);
  }

  // Set the model as active only if it's a Checkpoint
  if (modelType === 'Checkpoint' && !skipLoadModel) {
    // Set the model as the active model
    await axios.post(SD_API_URL + '/sdapi/v1/options', {
      sd_model_checkpoint: modelFileName,
    });
  }

  // Upsert the model into the database
  await prisma.aiModel.upsert({
    where: { id: modelData.id },
    update: {
      name: modelData.name,
      fileName: modelFileName,
      type: modelData.type,
      baseModel: modelVersion.baseModel,
      baseModelType: modelVersion.baseModelType,
      description: modelData.description,
    },
    create: {
      id: modelData.id,
      modelId: modelData.id,
      name: modelData.name,
      fileName: modelFileName,
      type: modelData.type,
      baseModel: modelVersion.baseModel,
      baseModelType: modelVersion.baseModelType,
      description: modelData.description,
    },
  });

  return { message: 'Model loaded successfully.' };
}

export async function setActiveModel(modelName: string, basePath: string) {
  const checkpointDir = path.join(basePath, 'models/Stable-diffusion/');
  const modelPath = path.join(checkpointDir, modelName);

  // Check if the model file exists
  if (!fs.existsSync(modelPath)) {
    throw new Error('Model file not found locally.');
  }

  // Set the model as the active model
  await axios.post(SD_API_URL + '/sdapi/v1/options', {
    sd_model_checkpoint: modelName,
  });

  return { message: 'Model set as active successfully.' };
}
