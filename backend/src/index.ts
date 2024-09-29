import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs-extra';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Route to search models on CivitAI
app.get('/search', async (req, res) => {
  const { query } = req.query;
  try {
    const response = await axios.get('https://civitai.com/api/v1/models', {
      params: { query },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data from CivitAI:', error);
    res.status(500).json({ error: 'An error occurred while fetching data' });
  }
});

// Route to load a model into Stable Diffusion WebUI
app.post('/load-model', async (req, res) => {
  const { modelId } = req.body;
  try {
    // Fetch model details from CivitAI
    const modelResponse = await axios.get(
      `https://civitai.com/api/v1/models/${modelId}`
    );
    const modelData = modelResponse.data;

    // Determine the model type
    const modelType = modelData.type; // "Checkpoint", "LoRA", "TextualInversion", etc.

    // Get the latest version of the model
    const modelVersion = modelData.modelVersions[0];

    // Find the appropriate file to download based on type
    let modelFile = modelVersion.files.find((file: any) => {
      return (
        (file.type === 'Model' || file.type === 'Pruned Model') &&
        (file.format === 'SafeTensor' || file.format === 'PickleTensor')
      );
    });

    // If no suitable file found, look for other types
    if (!modelFile) {
      modelFile = modelVersion.files.find((file: any) => true); // Fallback to any file
    }

    if (!modelFile) {
      res.status(404).json({ error: 'Model file not found.' });
      return;
    }

    const modelUrl = modelFile.downloadUrl;
    const modelFileName = modelFile.name;

    // Include API Key in Headers
    const apiKey = process.env.CIVITAI_API_TOKEN;
    if (!apiKey) {
      res.status(500).json({ error: 'CivitAI API key not configured.' });
      return;
    }

    const basePath = process.env.MODEL_PATH;
    if (!basePath) {
      res.status(500).json({ error: 'Model path not configured.' });
      return;
    }
    let modelPath: string;
    switch (modelType) {
      case 'Checkpoint':
        modelPath = path.join(
          basePath,
          'models/Stable-diffusion/',
          modelFileName
        );
        break;
      case 'TextualInversion':
        modelPath = path.join(basePath, 'embeddings/', modelFileName);
        break;
      case 'LoRA':
        modelPath = path.join(basePath, 'models/Lora/', modelFileName);
        break;
      case 'Hypernetwork':
        modelPath = path.join(basePath, 'models/hypernetworks/', modelFileName);
        break;
      case 'AestheticGradient':
        modelPath = path.join(
          basePath,
          'models/aesthetic_embeddings/',
          modelFileName
        );
        break;
      default:
        res.status(400).json({ error: 'Unsupported model type.' });
        return;
    }

    // Download the model file
    await downloadFile(modelUrl, modelPath, apiKey);

    // Refresh models in Stable Diffusion WebUI if necessary
    if (modelType === 'Checkpoint') {
      // Refresh and set the model
      await axios.post('http://localhost:7860/sdapi/v1/refresh-checkpoints');
      await axios.post('http://localhost:7860/sdapi/v1/options', {
        sd_model_checkpoint: modelFileName,
      });
    } else if (modelType === 'LoRA') {
      // Refresh LoRA models if needed
      // No specific API endpoint, but may be refreshed automatically
    } else if (modelType === 'TextualInversion') {
      // Refresh embeddings if needed
      await axios.post('http://localhost:7860/sdapi/v1/refresh-embeddings');
    }

    res.json({ message: 'Model loaded successfully.' });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.response?.data);
      res.status(error.response?.status || 500).json({
        error:
          error.response?.data?.message ||
          'An error occurred while loading the model.',
      });
    } else {
      console.error('Error loading model:', error);
      res
        .status(500)
        .json({ error: 'An error occurred while loading the model.' });
    }
  }
});

// Function to download a file with authentication
async function downloadFile(url: string, dest: string, apiKey: string) {
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
      fs.unlink(dest);
      reject(err);
    });
  });
}

app.post('/generate-image', async (req, res) => {
  const { prompt } = req.body;
  try {
    // Send request to Stable Diffusion WebUI API
    const response = await axios.post(
      'http://localhost:7860/sdapi/v1/txt2img',
      {
        prompt,
        steps: 50,
        width: 512,
        height: 512,
        sampler_name: 'Euler a',
        cfg_scale: 7,
        seed: -1, // Use -1 for a random seed
        // You can include other parameters here, such as width, height, steps, etc.
      }
    );

    // The API returns a base64-encoded image
    const imageBase64 = response.data.images[0];
    console.log('imageBase64:', imageBase64);

    res.json({ image: imageBase64 });
  } catch (error) {
    console.error('Error generating image:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while generating the image.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
