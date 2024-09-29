import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs-extra';
import { glob } from 'glob';
import path from 'path';

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const basePath = process.env.MODEL_PATH;
if (!basePath) {
  console.error('Model path not configured.');
  process.exit(1);
}

// Endpoint to list downloaded models
app.get('/list-models', async (req, res) => {
  try {
    const checkpointDir = path.join(basePath, 'models/Stable-diffusion/');
    const files = await glob('**/*.{ckpt,safetensors,pt}', {
      cwd: checkpointDir,
    });
    const models = files.map((file) => ({
      name: path.basename(file),
      path: path.join(checkpointDir, file),
    }));
    res.json(models);
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'An error occurred while listing models.' });
  }
});

// Endpoint to list downloaded LoRas
app.get('/list-loras', async (req, res) => {
  try {
    const loraDir = path.join(basePath, 'models/Lora/');
    const files = await glob('**/*.{safetensors,pt}', { cwd: loraDir });
    const loras = files.map((file) => ({
      name: path.basename(file),
      path: path.join(loraDir, file),
    }));
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRas:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRas.' });
  }
});

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
      // Adjust the conditions based on the file types and formats you expect
      return (
        (file.type === 'Model' ||
          file.type === 'Pruned Model' ||
          file.type === 'LoRA') &&
        (file.format === 'SafeTensor' || file.format === 'PickleTensor')
      );
    });

    // If no suitable file found, look for any available file
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
        // No refresh endpoint needed for LoRA
        break;
      // Add cases for other model types if necessary
      default:
        res.status(400).json({ error: 'Unsupported model type.' });
        return;
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
    if (refreshEndpoint) {
      await axios.post(`http://localhost:7860${refreshEndpoint}`);
    }

    // Set the model as active only if it's a Checkpoint
    if (modelType === 'Checkpoint') {
      // Set the model as the active model
      await axios.post('http://localhost:7860/sdapi/v1/options', {
        sd_model_checkpoint: modelFileName,
      });
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

app.post('/set-active-model', async (req, res) => {
  const { modelName } = req.body;
  try {
    const checkpointDir = path.join(basePath, 'models/Stable-diffusion/');
    const modelPath = path.join(checkpointDir, modelName);

    // Check if the model file exists
    if (!fs.existsSync(modelPath)) {
      // Model file does not exist; attempt to find and download it
      // You may need to implement logic to search for the model by name in CivitAI
      res.status(404).json({ error: 'Model file not found locally.' });
      return;
    }

    // Set the model as the active model
    await axios.post('http://localhost:7860/sdapi/v1/options', {
      sd_model_checkpoint: modelName,
    });

    res.json({ message: 'Model set as active successfully.' });
  } catch (error) {
    console.error('Error setting active model:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while setting the active model.' });
  }
});

app.post('/generate-image', async (req, res) => {
  const { prompt, negative_prompt, steps, width, height, loras, model } =
    req.body;
  try {
    // Check the currently active model
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

    // Retrieve LoRA data from the WebUI API
    const loraResponse = await axios.get(
      'http://localhost:7860/sdapi/v1/loras'
    );
    const loraData = loraResponse.data; // Assuming this is an array of LoRA objects

    // Create a mapping from filename to alias
    const filenameToAliasMap: { [key: string]: string } = {};
    for (const lora of loraData) {
      const filename = path.basename(lora.path);
      const alias = lora.alias;
      filenameToAliasMap[filename] = alias;
    }

    // Construct prompt with correct LoRA references
    let finalPrompt = prompt;
    if (loras && loras.length > 0) {
      const loraPrompts = loras.map((loraFilename: string) => {
        const loraAlias = filenameToAliasMap[loraFilename];
        if (loraAlias) {
          return `<lora:${loraAlias}:1>`;
        } else {
          console.warn(`LoRA alias not found for filename: ${loraFilename}`);
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

    const imageBase64 = response.data.images[0];

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
