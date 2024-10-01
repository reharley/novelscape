import axios from 'axios';
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sanitizeHtml } from '../utils/sanitizer';

// Configuration
const CIVITAI_API_TOKEN = process.env.CIVITAI_API_TOKEN;
const CIVITAI_BASE_URL =
  process.env.CIVITAI_BASE_URL || 'https://civitai.com/api/v1';

if (!CIVITAI_API_TOKEN) {
  throw new Error(
    'CIVITAI_API_TOKEN is not defined in the environment variables.'
  );
}

// Axios Instance
const civitaiAxios = axios.create({
  baseURL: CIVITAI_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${CIVITAI_API_TOKEN}`,
  },
});
interface CivitaiModel {
  id: number;
  name: string;
  description: string;
  fileName: string;
  type: string;
  modelVersions: any[]; // Define more specific types as needed
}
interface GenerationMeta {
  prompt: string;
  negativePrompt: string;
  cfgScale: number;
  steps: number;
  sampler: string;
  seed: number;
  civitaiResources: {
    type: string;
    weight?: number;
    modelVersionId: number;
    modelVersionName: string;
  }[];
  Size: string;
  'Created Date': string;
  clipSkip: number;
}

interface CivitaiResponse {
  result: {
    data: {
      json: {
        meta: GenerationMeta;
      };
    };
  };
}
function generateUrl(imageId: number): string {
  const data = {
    json: {
      id: imageId,
      // authed: true,
    },
  };

  const jsonString = JSON.stringify(data);
  const encodedInput = encodeURIComponent(jsonString);
  const url = `https://civitai.com/api/trpc/image.getGenerationData?input=${encodedInput}`;

  return url;
}
async function fetchGenerationData(
  imageId: number
): Promise<GenerationMeta | null> {
  const url = generateUrl(imageId);
  console.log(`Fetching data from URL: ${url}`);

  try {
    const response = await axios.get<CivitaiResponse>(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `HTTP error! Status: ${response.status} ${response.statusText}`
      );
    }

    const meta: GenerationMeta = response.data.result.data.json.meta;
    console.log('Generation Data:', meta);
    return meta;
  } catch (error: any) {
    console.error('Error fetching generation data:', error.message || error);
    return null;
  }
}

export async function getGenerationData(req: Request, res: Response) {
  const { imageId } = req.body;

  if (!imageId || isNaN(Number(imageId))) {
    res.status(400).json({ error: 'Valid imageId is required.' });
    return;
  }

  try {
    await fetchGenerationData(Number(imageId));
    res.json({ message: 'Generation data fetched and stored successfully.' });
  } catch (error: any) {
    console.error(
      'Error in fetching and storing generation data:',
      error.message || error
    );
    res
      .status(500)
      .json({ error: 'An error occurred while fetching generation data.' });
  }
}

export async function getImageGenerationData(req: Request, res: Response) {
  const { imageId } = req.params;

  if (!imageId || isNaN(Number(imageId))) {
    res.status(400).json({ error: 'Valid imageId parameter is required.' });
    return;
  }

  try {
    const generationData = await prisma.generationData.findUnique({
      where: { modelImageId: Number(imageId) },
      include: {
        civitaiResources: true,
      },
    });

    if (!generationData) {
      res
        .status(404)
        .json({ error: 'Generation data not found for the given image ID.' });
      return;
    }

    res.json(generationData);
  } catch (error: any) {
    console.error('Error fetching generation data:', error.message || error);
    res
      .status(500)
      .json({ error: 'An error occurred while fetching generation data.' });
  }
}

export async function searchModels(req: Request, res: Response) {
  const {
    limit,
    page,
    query,
    tag,
    username,
    types,
    sort,
    period,
    rating,
    favorites,
    hidden,
    primaryFileOnly,
    allowNoCredit,
    allowDerivatives,
    allowDifferentLicenses,
    allowCommercialUse,
    nsfw,
    supportsGeneration,
  } = req.query;

  const params: any = {};

  if (limit) params.limit = limit;
  if (page) params.page = page;
  if (query) params.query = query;
  if (tag) params.tag = tag;
  if (username) params.username = username;
  if (types) params.types = types;
  if (sort) params.sort = sort;
  if (period) params.period = period;
  if (rating) params.rating = rating;
  if (favorites) params.favorites = favorites;
  if (hidden) params.hidden = hidden;
  if (primaryFileOnly) params.primaryFileOnly = primaryFileOnly;
  if (allowNoCredit) params.allowNoCredit = allowNoCredit;
  if (allowDerivatives) params.allowDerivatives = allowDerivatives;
  if (allowDifferentLicenses)
    params.allowDifferentLicenses = allowDifferentLicenses;
  if (allowCommercialUse) params.allowCommercialUse = allowCommercialUse;
  if (nsfw) params.nsfw = nsfw;
  if (supportsGeneration) params.supportsGeneration = supportsGeneration;

  try {
    const response = await civitaiAxios.get('/models', { params });

    // Sanitize descriptions
    if (response.data && response.data.items) {
      response.data.items.forEach((item: any) => {
        if (item.description) {
          item.description = sanitizeHtml(item.description);
        }
      });
    }

    res.json(response.data);
  } catch (error: any) {
    console.error(
      'Error fetching models from CivitAI:',
      error.message || error
    );
    res.status(500).json({ error: 'An error occurred while fetching models.' });
  }
}

// Get Model by ID
export async function getModelById(req: Request, res: Response) {
  const { modelId } = req.params;

  if (!modelId || isNaN(Number(modelId))) {
    res.status(400).json({ error: 'Valid modelId parameter is required.' });
    return;
  }

  try {
    const response = await civitaiAxios.get(`/models/${modelId}`);

    // Sanitize descriptions
    if (response.data.description) {
      response.data.description = sanitizeHtml(response.data.description);
    }
    if (response.data.modelVersions) {
      response.data.modelVersions.forEach((version: any) => {
        if (version.description) {
          version.description = sanitizeHtml(version.description);
        }
      });
    }

    res.json(response.data);
  } catch (error: any) {
    console.error(
      `Error fetching model ${modelId} from CivitAI:`,
      error.message || error
    );
    res
      .status(500)
      .json({ error: 'An error occurred while fetching the model.' });
  }
}

// Get Creators
export async function getCreators(req: Request, res: Response) {
  const { limit, page, query } = req.query;

  const params: any = {};

  if (limit) params.limit = limit;
  if (page) params.page = page;
  if (query) params.query = query;

  try {
    const response = await civitaiAxios.get('/creators', { params });
    res.json(response.data);
  } catch (error: any) {
    console.error(
      'Error fetching creators from CivitAI:',
      error.message || error
    );
    res
      .status(500)
      .json({ error: 'An error occurred while fetching creators.' });
  }
}

// Get Images
export async function getImages(req: Request, res: Response) {
  const {
    limit,
    postId,
    modelId,
    modelVersionId,
    username,
    nsfw,
    sort,
    period,
    page,
  } = req.query;

  const params: any = {};

  if (limit) params.limit = limit;
  if (postId) params.postId = postId;
  if (modelId) params.modelId = modelId;
  if (modelVersionId) params.modelVersionId = modelVersionId;
  if (username) params.username = username;
  if (nsfw) params.nsfw = nsfw;
  if (sort) params.sort = sort;
  if (period) params.period = period;
  if (page) params.page = page;

  try {
    const response = await civitaiAxios.get('/images', { params });
    res.json(response.data);
  } catch (error: any) {
    console.error(
      'Error fetching images from CivitAI:',
      error.message || error
    );
    res.status(500).json({ error: 'An error occurred while fetching images.' });
  }
}

// Get Model Version by ID
export async function getModelVersionById(req: Request, res: Response) {
  const { modelVersionId } = req.params;

  if (!modelVersionId || isNaN(Number(modelVersionId))) {
    res
      .status(400)
      .json({ error: 'Valid modelVersionId parameter is required.' });
    return;
  }

  try {
    const response = await civitaiAxios.get(
      `/model-versions/${modelVersionId}`
    );

    // Sanitize descriptions
    if (response.data.description) {
      response.data.description = sanitizeHtml(response.data.description);
    }

    res.json(response.data);
  } catch (error: any) {
    console.error(
      `Error fetching model version ${modelVersionId} from CivitAI:`,
      error.message || error
    );
    res
      .status(500)
      .json({ error: 'An error occurred while fetching the model version.' });
  }
}

// Get Model Version by Hash
export async function getModelVersionByHash(req: Request, res: Response) {
  const { hash } = req.params;

  if (!hash || typeof hash !== 'string') {
    res.status(400).json({ error: 'Valid hash parameter is required.' });
    return;
  }

  try {
    const response = await civitaiAxios.get(`/model-versions/by-hash/${hash}`);

    // Sanitize descriptions
    if (response.data.description) {
      response.data.description = sanitizeHtml(response.data.description);
    }

    res.json(response.data);
  } catch (error: any) {
    console.error(
      `Error fetching model version by hash ${hash} from CivitAI:`,
      error.message || error
    );
    res.status(500).json({
      error: 'An error occurred while fetching the model version by hash.',
    });
  }
}

// Get Tags
export async function getTags(req: Request, res: Response) {
  const { limit, page, query } = req.query;

  const params: any = {};

  if (limit) params.limit = limit;
  if (page) params.page = page;
  if (query) params.query = query;

  try {
    const response = await civitaiAxios.get('/tags', { params });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching tags from CivitAI:', error.message || error);
    res.status(500).json({ error: 'An error occurred while fetching tags.' });
  }
}
