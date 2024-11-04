import { Request, Response } from 'express';
import prisma from '../config/prisma.js';
import {
  generateImage,
  GenerateImageParams,
} from '../services/imageService.js';

export async function generateImageForProfile(req: Request, res: Response) {
  const { profileGenerationId } = req.body;

  try {
    const generationData = await prisma.profileGenerationData.findUnique({
      where: { id: Number(profileGenerationId) },
      include: {
        profile: true,
        loras: { include: { aiModel: true } },
        embeddings: { include: { aiModel: true } },
        negativeEmbeddings: { include: { aiModel: true } },
        checkpoint: true,
        generationPackage: true,
      },
    });

    if (!generationData) {
      res.status(404).json({ error: 'generationData not found.' });
      return;
    }
    const profile = generationData.profile;

    // 2. Prepare Image Generation Parameters
    const finalPrompt = generationData.prompt;
    const finalNegativePrompt = generationData.negativePrompt || '';
    const characterImageSize = {
      width: generationData.width || 512,
      height: generationData.height || 512,
    };
    const positiveLoras = generationData.loras.map((lora) => ({
      name: lora.aiModel.fileName,
      weight: lora.weight,
    }));
    const embeddings = generationData.embeddings.map(
      (embedding) => embedding.aiModel.fileName
    );
    const negativeEmbeddings = generationData.negativeEmbeddings.map(
      (embedding) => embedding.aiModel.fileName
    );
    const modelFileName = generationData.checkpoint.fileName; // Assuming 'name' corresponds to the model file name

    const generateImageParams: GenerateImageParams = {
      prompt: finalPrompt,
      negativePrompt: finalNegativePrompt,
      steps: generationData.steps,
      ...characterImageSize,
      loras: positiveLoras,
      embeddings: embeddings,
      negative_embeddings: negativeEmbeddings,
      model: modelFileName,
      removeBackground: generationData.removeBackground,
    };

    // 3. Generate Image
    const imageResult = await generateImage(generateImageParams);

    if (!imageResult || !imageResult.imageUrl) {
      res.status(500).json({ error: 'Image generation failed.' });
      return;
    }

    // 4. Update Profile with imageUrl
    let updatedProfile;
    if (profile) {
      updatedProfile = await prisma.profile.update({
        where: { id: Number(profile.id) },
        data: {
          imageUrl: imageResult.imageUrl,
        },
      });
    }

    // 5. Respond to Client
    res.status(200).json({
      message: 'Image generated and profile updated successfully.',
      imageUrl: imageResult.imageUrl,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

export async function getProfilesForBook(req: Request, res: Response) {
  try {
    const bookId = Number(req.params.bookId);
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
}
