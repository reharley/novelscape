import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cors from 'cors';
import DOMPurify from 'dompurify';
import dotenv from 'dotenv';
import EPub from 'epub2';
import express from 'express';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import OpenAI from 'openai';
import path from 'path';

const prisma = new PrismaClient();

if (!process.env.OPENAI_API_KEY) {
  console.error('OpenAI API key not found.');
  process.exit(1);
}
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

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
    const models = await prisma.aiModel.findMany({
      where: { type: 'Checkpoint' },
    });
    res.json(models);
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'An error occurred while listing models.' });
  }
});

// Directory where EPUB files are stored
const booksDir = process.env.BOOKS_PATH;
if (!booksDir) {
  console.error('Books path not configured.');
  process.exit(1);
}
const extractedDir = path.join(__dirname, '..', 'extracted_books');
app.get('/api/books/files', async (req, res) => {
  try {
    const files = await fs.readdir(booksDir);
    const bookFiles = files.filter((file) => file.endsWith('.epub'));
    res.json(bookFiles); // Return only EPUB files
  } catch (error) {
    console.error('Error fetching book files:', error);
    res.status(500).json({ error: 'Failed to fetch book files.' });
  }
});
// Create extracted_books directory if it doesn't exist
if (!fs.existsSync(extractedDir)) {
  fs.mkdirSync(extractedDir);
}
// API to list available books
app.get('/api/books', (req, res) => {
  fs.readdir(booksDir, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading books directory');
    }
    const books = files
      .filter((file) => file.endsWith('.epub'))
      .map((file) => path.parse(file).name);
    res.json(books);
  });
});

// API to get book content
app.get('/api/books/:bookId', (req, res) => {
  const { bookId } = req.params;
  const bookPath = path.join(booksDir, `${bookId}.epub`);

  if (!fs.existsSync(bookPath)) {
    res.status(404).send('Book not found');
    return;
  }

  const epub = new EPub(bookPath);

  epub.on('end', () => {
    const chapters = epub.flow;
    let structuredContent: any[] = [];
    let processedChapters = 0;

    if (chapters.length === 0) {
      res.status(404).send('No chapters found in the book');
      return;
    }

    chapters.forEach((chapter, index) => {
      const chapterId = chapter.id;
      if (!chapterId) {
        processedChapters++;
        return; // Skip chapters without an ID
      }

      epub.getChapterRaw(chapterId, (err, text) => {
        processedChapters++;
        if (err || !text) {
          console.error(`Error reading chapter ${chapterId}:`, err);
        } else {
          // Parse the chapter content and structure it
          const chapterTitle = chapter.title || `Chapter ${index + 1}`;
          const contents = parseChapterContent(text);
          structuredContent.push({
            order: index,
            chapterTitle,
            contents,
          });
        }
        if (processedChapters === chapters.length) {
          // Sort structuredContent based on chapter order
          structuredContent.sort((a, b) => a.order - b.order);
          res.json(structuredContent);
        }
      });
    });

    const manifestItems = Object.values(epub.manifest); // Extract manifest entries as an array
    const extractPath = path.join(extractedDir, bookId);
    manifestItems.forEach((item) => {
      if (!item.id) return;
      epub.getFile(item.id, (err, data, mimeType) => {
        if (!item.href) return;
        if (err) {
          console.error(`Error extracting file ${item.href}:`, err);
        } else {
          // Create the appropriate subdirectory if needed
          const outputPath = path.join(extractPath, item.href);
          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          // Write file to disk
          if (data) fs.writeFileSync(outputPath, data);
          console.log(`Extracted: ${item.href}`);
        }
      });
    });
  });

  epub.parse();
});

function parseChapterContent(text: string) {
  const $ = cheerio.load(text);
  const contents: any[] = [];

  function processElement(element: cheerio.Element) {
    // @ts-ignore
    const tagName = element.tagName.toLowerCase();

    // Generalized heading check for any h1, h2, h3, h4, h5, h6 tags
    const text = $(element).text().trim();
    if (/^h[1-6]$/.test(tagName)) {
      if (text.length === 0) return; // Skip empty elements
      contents.push({
        type: 'title',
        text: $(element).text(),
        size: tagName, // Include the tag size (e.g., h1, h2)
      });
    } else if (tagName === 'p') {
      const imagesInParagraph = $(element).find('img');
      if (imagesInParagraph.length > 0) {
        if (text.length === 0) return; // Skip empty elements
        imagesInParagraph.each((_, img) => {
          const src = $(img).attr('src');
          contents.push({
            type: 'paragraph',
            text: $(element).text(), // Extract text of the paragraph
            src, // Attach image source if present
          });
        });
      } else {
        if (text.length === 0) return; // Skip empty elements
        contents.push({
          type: 'paragraph',
          text: $(element).text(),
        });
      }
    } else if (tagName === 'div') {
      $(element)
        .children()
        .each((_, child) => {
          processElement(child);
        });
    } else if (tagName === 'img') {
      if (text.length === 0) return; // Skip empty elements
      const src = $(element).attr('src');
      contents.push({
        type: 'image',
        src,
      });
    } else {
      if (text.length === 0) return; // Skip empty elements
      contents.push({
        type: 'unknown',
        text: $(element).text(),
        tag: tagName,
      });
    }
  }

  // Process all body children elements recursively
  $('body')
    .children()
    .each((_, element) => {
      processElement(element);
    });

  return contents;
}
app.post('/api/profiles/:profileId/generate-image', async (req, res) => {
  const { profileId } = req.params;
  try {
    // Fetch the profile from the database
    const profile = await prisma.profile.findUnique({
      where: { id: Number(profileId) },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    // // Generate image using the description as prompt
    // const response = await axios.post('http://localhost:5000/generate-image', {
    //   prompt: profile.description,
    //   // Include other parameters like selected model or loras if needed
    // });

    // const imageBase64 = response.data.image;

    // // Save the image to the server or a cloud storage
    // const imagePath = `/images/profiles/${profile.id}.png`;
    // const imageFullPath = path.join(__dirname, 'public', imagePath);
    // await fs.ensureDir(path.dirname(imageFullPath));
    // fs.writeFileSync(imageFullPath, Buffer.from(imageBase64, 'base64'));

    // // Update the profile with the image URL
    // await prisma.profile.update({
    //   where: { id: Number(profileId) },
    //   data: { imageUrl: imagePath },
    // });

    res.json({});
    // res.json({ imageUrl: imagePath });
  } catch (error) {
    console.error('Error generating image for profile:', error);
    res.status(500).json({ error: 'Failed to generate image.' });
  }
});

// Endpoint to get the list of books
app.get('/api/books-list', async (req, res) => {
  try {
    const books = await prisma.book.findMany();
    res.json(books);
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ error: 'Failed to fetch books.' });
  }
});

// Endpoint to get profiles for a book
app.get('/api/books/:bookId/profiles', async (req, res) => {
  const { bookId } = req.params;
  try {
    const profiles = await prisma.profile.findMany({
      where: { bookId },
      include: {
        descriptions: true, // Include descriptions
      },
    });
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles.' });
  }
});
app.get('/api/books/files', async (req, res) => {
  try {
    const files = await fs.readdir(booksDir);
    const bookFiles = files.filter((file) => file.endsWith('.epub'));
    res.json(bookFiles); // Return only EPUB files
  } catch (error) {
    console.error('Error fetching book files:', error);
    res.status(500).json({ error: 'Failed to fetch book files.' });
  }
});
app.post('/api/books/:bookId/extract-profiles', async (req, res) => {
  const { bookId } = req.params;
  const bookPath = path.join(booksDir, bookId);

  try {
    // Check if the book exists
    if (
      !(await fs
        .access(bookPath)
        .then(() => true)
        .catch(() => false))
    ) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    // Upsert the book with id as filename
    const book = await prisma.book.upsert({
      where: { id: bookId },
      update: {},
      create: {
        id: bookId,
        title: path.parse(bookId).name,
      },
    });

    const epub = new EPub(bookPath);

    epub.on('end', async () => {
      const chapters = epub.flow;

      if (chapters.length === 0) {
        return res.status(404).json({ error: 'No chapters found in the book' });
      }

      // Process chapters sequentially using async/await
      for (const [index, chapter] of chapters.entries()) {
        const chapterId = chapter.id;
        if (!chapterId) continue;

        try {
          // Get the chapter content asynchronously
          const text = await getChapterRawAsync(epub, chapterId);
          if (!text) {
            console.error(`Error: Chapter ${chapterId} is empty.`);
            continue;
          }

          const chapterTitle = chapter.title || `Chapter ${index + 1}`;
          const contents = parseChapterContent(text); // Assuming this parses chapter content

          // Process each paragraph or title individually
          for (const contentItem of contents) {
            if (
              contentItem.type === 'paragraph' ||
              contentItem.type === 'title'
            ) {
              const textContent = contentItem.text.trim();

              if (!textContent) {
                console.log(
                  `Skipping empty content in chapter: ${chapterTitle}`
                );
                continue;
              }

              // Create Extraction entry
              const extraction = await prisma.extraction.create({
                data: {
                  textContent,
                  bookId: book.id,
                },
              });

              // Send text to OpenAI API for NER
              const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                  {
                    role: 'system',
                    content: `You are an assistant that performs named entity recognition (NER) on a given text. Identify and extract all named entities, categorizing them as one of the following types: 'Character', 'Building', 'Scene', 'Animal', 'Object'. For each entity, provide:
- name: The name of the entity.
- type: One of 'Character', 'Building', 'Scene', 'Animal', or 'Object'.
- description: A brief description of the entity based on the context.

Output the result as a JSON array of entities.`,
                  },
                  {
                    role: 'user',
                    content: `Extract entities from the following text:\n\n${textContent}`,
                  },
                ],
                max_tokens: 1000,
              });

              let assistantMessage = response.choices[0].message?.content || '';

              // Sanitize the response
              assistantMessage = assistantMessage
                .trim()
                .replace(/```(?:json|)/g, '')
                .trim();

              // Attempt to extract and parse JSON from the assistant's message
              let entities;
              try {
                entities = JSON.parse(assistantMessage);
              } catch (parseError) {
                console.error('JSON parse error:', parseError);
                const jsonMatch = assistantMessage.match(/\[.*\]/s);
                if (jsonMatch) {
                  entities = JSON.parse(jsonMatch[0]);
                } else {
                  console.error(
                    'Failed to parse entities as JSON after sanitization.'
                  );
                  continue; // Skip if unable to parse
                }
              }

              // Save profiles and descriptions to the database
              for (const entity of entities) {
                const profileType = entity.type.toUpperCase();
                // Upsert Profile
                const profile = await prisma.profile.upsert({
                  where: {
                    name_bookId: {
                      name: entity.name,
                      bookId: book.id,
                    },
                  },
                  update: {},
                  create: {
                    name: entity.name,
                    type: profileType,
                    bookId: book.id,
                  },
                });

                // Create Description linked to Profile and Extraction
                await prisma.description.create({
                  data: {
                    text: entity.description,
                    profileId: profile.id,
                    extractionId: extraction.id,
                  },
                });
              }
            }
          }
        } catch (chapterError) {
          console.error(`Error processing chapter ${chapterId}:`, chapterError);
        }
      }

      res.json({ message: 'Entities extracted and saved successfully.' });
    });

    epub.parse();
  } catch (error) {
    console.error('Error extracting profiles:', error);
    res.status(500).json({ error: 'Failed to extract profiles.' });
  }
});

function getChapterRawAsync(epub: EPub, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapterRaw(chapterId, (err, text) => {
      if (err) {
        reject(err);
      } else {
        resolve(text || '');
      }
    });
  });
}

app.delete('/api/books/:bookId', async (req, res) => {
  const { bookId } = req.params;

  try {
    // Manually delete related extractions and profiles before deleting the book
    await prisma.description.deleteMany({
      where: {
        profile: {
          bookId,
        },
      },
    });

    await prisma.extraction.deleteMany({
      where: { bookId },
    });

    await prisma.profile.deleteMany({
      where: { bookId },
    });

    // Finally, delete the book
    await prisma.book.delete({
      where: { id: bookId },
    });

    res.json({ message: 'Book and associated profiles deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
});
// Endpoint to list downloaded LoRas
app.get('/list-loras', async (req, res) => {
  try {
    const loras = await prisma.aiModel.findMany({
      where: { type: 'LoRA' },
    });
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRAs:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRAs.' });
  }
});

app.get('/search', async (req, res) => {
  const { query } = req.query;
  try {
    const response = await axios.get('https://civitai.com/api/v1/models', {
      params: { query },
    });
    response.data.items.forEach((item: any) => {
      item.description = domPurify.sanitize(item.description);
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

    // Upsert the model into the database
    await prisma.aiModel.upsert({
      where: { modelId: modelData.id },
      update: {
        name: modelData.name,
        fileName: modelFileName,
        type: modelData.type,
        description: modelData.description,
        images: modelData.modelVersions[0]?.images,
      },
      create: {
        modelId: modelData.id,
        name: modelData.name,
        fileName: modelFileName,
        type: modelData.type,
        description: modelData.description,
        images: modelData.modelVersions[0]?.images,
      },
    });

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
