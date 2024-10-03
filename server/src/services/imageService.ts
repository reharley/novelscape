import axios from 'axios';
import path from 'path';

export async function generateImage(data: any) {
  const { prompt, negative_prompt, steps, width, height, loras, model } = data;

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

    const imageBase64 = response.data.images[0];

    return { image: imageBase64 };
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('An error occurred while generating the image.');
  }
}
