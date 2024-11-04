import { Request, Response } from 'express';
import {
  generateAudioForPassages,
  generateWordTimestamps,
} from '../services/ttsService.js';

export const generateMultiple = async (req: Request, res: Response) => {
  const { passageIds } = req.body;

  if (!Array.isArray(passageIds)) {
    res.status(400).json({ error: 'passageIds must be an array' });
    return;
  }

  try {
    // Generate audio URLs for passages
    const audioUrls = await generateAudioForPassages(passageIds); // Returns { [passageId]: string }

    // Generate word timestamps for each passage
    const { wordTimestamps } = await generateWordTimestamps(passageIds); // Returns { wordTimestamps: { [passageId]: WordTimestamp[] }

    res.status(200).json({
      audioUrls,
      wordTimestamps,
    });
    return;
  } catch (error) {
    console.error('Error generating multiple audio and timestamps:', error);
    res.status(500).json({ error: 'Failed to generate audio and timestamps' });
    return;
  }
};
