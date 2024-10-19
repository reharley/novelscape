import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma.js';
import {
  listModels,
  loadModel,
  setActiveModel,
} from '../services/modelService.js';

// List Checkpoints
export async function listCheckpoints(req: Request, res: Response) {
  const basePath = process.env.MODEL_PATH;
  if (!basePath) {
    throw new Error('Model path not configured.');
  }
  const checkpointPath = path.join(basePath, 'models/Stable-diffusion');
  try {
    const files = fs.readdirSync(checkpointPath);
    const checkpoints = files.filter(
      (file) => file.endsWith('.ckpt') || file.endsWith('.safetensors')
    );
    res.json(checkpoints);
  } catch (error) {
    console.error('Error listing checkpoints:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while listing checkpoints.' });
  }
}

// List LoRAs
export async function listLoras(req: Request, res: Response) {
  const basePath = process.env.MODEL_PATH;
  if (!basePath) {
    throw new Error('Model path not configured.');
  }
  const loraPath = path.join(basePath, 'models/Lora');
  try {
    const files = fs.readdirSync(loraPath);
    const loras = files.filter(
      (file) => file.endsWith('.pt') || file.endsWith('.safetensors')
    );
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRAs:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRAs.' });
  }
}

// List Embeddings
export async function listEmbeddings(req: Request, res: Response) {
  const basePath = process.env.MODEL_PATH;
  if (!basePath) {
    throw new Error('Model path not configured.');
  }
  const embeddingPath = path.join(basePath, 'embeddings');
  try {
    const files = fs.readdirSync(embeddingPath);
    const embeddings = files.filter(
      (file) => file.endsWith('.bin') || file.endsWith('.pt')
    );
    res.json(embeddings);
  } catch (error) {
    console.error('Error listing embeddings:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while listing embeddings.' });
  }
}

export async function listDownloadedModels(req: Request, res: Response) {
  const { profileId } = req.query;
  try {
    const models = await listModels('Checkpoint', profileId as string);
    res.json(models);
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'An error occurred while listing models.' });
  }
}

export async function listDownloadedLoras(req: Request, res: Response) {
  try {
    const loras = await listModels('LORA');
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRAs:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRAs.' });
  }
}

export async function listDownloadedEmbeddings(req: Request, res: Response) {
  try {
    const loras = await listModels('TextualInversion');
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRAs:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRAs.' });
  }
}

export async function associateModel(req: Request, res: Response) {
  const { profileId } = req.params;
  const { modelId } = req.body;

  if (!modelId || isNaN(Number(modelId))) {
    res.status(400).json({ error: 'Valid modelId is required.' });
    return;
  }

  try {
    const profileAiModel = await prisma.profileAiModel.create({
      data: {
        profile: { connect: { id: Number(profileId) } },
        aiModel: { connect: { id: Number(modelId) } },
      },
    });

    res.json(profileAiModel);
  } catch (error: any) {
    console.error(
      'Error associating model with profile:',
      error.message || error
    );
    res
      .status(500)
      .json({ error: 'An error occurred while associating the model.' });
  }
}

export async function getModelImages(req: Request, res: Response) {
  const { modelId } = req.params;
  try {
    const images = await prisma.modelImage.findMany({
      where: { modelId: Number(modelId) },
    });
    res.json(images);
  } catch (error: any) {
    console.error('Error fetching model images:', error.message || error);
    res
      .status(500)
      .json({ error: 'An error occurred while fetching model images.' });
  }
}

export async function loadModelController(req: Request, res: Response) {
  const { modelId } = req.body;
  const basePath = process.env.MODEL_PATH;
  const civitaiApiToken = process.env.CIVITAI_API_TOKEN;

  if (!basePath) {
    res.status(500).json({ error: 'Model path not configured.' });
    return;
  }

  try {
    const result = await loadModel(modelId);
    res.json(result);
  } catch (error: any) {
    console.error('Error loading model:', error);
    res.status(500).json({ error: error.message || 'Failed to load model.' });
  }
}

export async function setActiveModelController(req: Request, res: Response) {
  const { modelName } = req.body;
  const basePath = process.env.MODEL_PATH;

  if (!basePath) {
    res.status(500).json({ error: 'Model path not configured.' });
    return;
  }

  try {
    const result = await setActiveModel(modelName, basePath);
    res.json(result);
  } catch (error: any) {
    console.error('Error setting active model:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to set active model.' });
  }
}
