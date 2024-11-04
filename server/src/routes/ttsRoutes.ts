import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import express from 'express';
import { generateMultiple } from '../controllers/ttsController.js';
import { uploadAudio } from '../utils/azureStorage.js';

const router = express.Router();
const prisma = new PrismaClient();

// Endpoint to generate TTS for a passage
router.post('/generate/:passageId', async (req, res) => {
  const { passageId } = req.params;

  try {
    const passage = await prisma.passage.findUnique({
      where: { id: parseInt(passageId, 10) },
      include: { wordTimestamps: true },
    });

    if (!passage) {
      res.status(404).json({ error: 'Passage not found' });
      return;
    }

    if (passage.audioUrl && passage.wordTimestamps.length > 0) {
      res.status(200).json({ message: 'TTS already generated' });
      return;
    }

    // Prepare REST API request to ElevenLabs
    const VOICE_ID = 'pqHfZKP75CvOlQylNhV4'; // Replace with desired voice ID
    const YOUR_XI_API_KEY = process.env.ELEVENLABS_API_KEY;

    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`;

    const requestBody = {
      text: passage.textContent,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      'xi-api-key': YOUR_XI_API_KEY,
    };

    // Make POST request to ElevenLabs REST API
    const response = await axios.post(apiUrl, requestBody, { headers });

    if (response.status !== 200) {
      console.error(
        'Error from ElevenLabs API:',
        response.status,
        response.data
      );
      res.status(response.status).json({ error: 'Error generating TTS' });
      return;
    }

    const responseData = response.data;

    // Decode the base64 audio
    const audioBuffer = Buffer.from(responseData.audio_base64, 'base64');

    // Upload audio to Azure Storage
    const audioUrl = await uploadAudio(
      `passage_${passageId}.mp3`,
      audioBuffer,
      'audio/mpeg'
    );

    // Process alignment to get word timestamps
    const characters = responseData.alignment.characters;
    const startTimes = responseData.alignment.character_start_times_seconds;
    const endTimes = responseData.alignment.character_end_times_seconds;

    const words = passage.textContent.split(/\s+/);
    let wordTimestamps: any[] = [];
    let charIndex = 0;

    words.forEach((word) => {
      const wordLength = word.length;
      if (charIndex + wordLength > characters.length) return;
      const startTime = startTimes[charIndex];
      const endTime = endTimes[charIndex + wordLength - 1];
      wordTimestamps.push({
        word,
        startTime,
        endTime,
        passageId: passage.id,
      });
      charIndex += wordLength + 1; // Assuming single space
    });

    // Save word timestamps to the database
    await prisma.wordTimestamp.createMany({
      data: wordTimestamps,
    });

    // Update passage with the audio URL
    await prisma.passage.update({
      where: { id: passage.id },
      data: { audioUrl },
    });

    res.status(200).json({ message: 'TTS generated successfully', audioUrl });
  } catch (error) {
    console.error('Error generating TTS:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to generate TTS for multiple passages
router.post('/generate-multiple', generateMultiple);

// Endpoint to fetch word timestamps
router.get('/word-timestamps/:passageId', async (req, res) => {
  const { passageId } = req.params;

  try {
    const timestamps = await prisma.wordTimestamp.findMany({
      where: { passageId: parseInt(passageId, 10) },
      orderBy: { id: 'asc' },
    });

    res.status(200).json(timestamps);
  } catch (error) {
    console.error('Error fetching word timestamps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
