import axios from 'axios';
import prisma from '../config/prisma.js';
import { uploadAudio } from '../utils/azureStorage.js';

export const generateAudioForPassages = async (passageIds: number[]) => {
  if (passageIds.length > 4) {
    throw new Error('Cannot generate audio for more than 4 passages at once');
  }
  const results = await Promise.all(
    passageIds.map(async (passageId: number) => {
      try {
        console.log('Generating TTS for passage:', passageId);
        const passage = await prisma.passage.findUnique({
          where: { id: passageId },
          include: { wordTimestamps: true },
        });

        if (!passage) {
          return { passageId, error: 'Passage not found' };
        }

        if (passage.audioUrl && passage.wordTimestamps.length > 0) {
          return {
            passageId,
            message: 'TTS already generated',
            audioUrl: passage.audioUrl,
          };
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

        console.log('character count:', requestBody.text.length);
        // Make POST request to ElevenLabs REST API
        const response = await axios.post(apiUrl, requestBody, { headers });

        if (response.status !== 200) {
          console.error(
            'Error from ElevenLabs API:',
            response.status,
            response.data
          );
          return { passageId, error: 'Error generating TTS' };
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

        return {
          passageId,
          message: 'TTS generated successfully',
          audioUrl,
        };
      } catch (error) {
        console.error('Error generating TTS for passage:', passageId, error);
        return { passageId, error: 'Internal server error' };
      }
    })
  );

  // Transform the results into a dictionary
  const audioUrls: { [key: number]: string } = {};
  results.forEach((result) => {
    if (result.audioUrl) {
      audioUrls[result.passageId] = result.audioUrl;
    }
  });

  return audioUrls;
};

export const generateWordTimestamps = async (passageIds: number[]) => {
  try {
    const wordTimestamps = await prisma.wordTimestamp.findMany({
      where: { passageId: { in: passageIds } },
      orderBy: { id: 'asc' },
    });

    const groupedTimestamps: { [key: number]: any[] } = {};

    wordTimestamps.forEach((timestamp) => {
      if (!groupedTimestamps[timestamp.passageId]) {
        groupedTimestamps[timestamp.passageId] = [];
      }
      groupedTimestamps[timestamp.passageId].push(timestamp);
    });

    return { wordTimestamps: groupedTimestamps };
  } catch (error) {
    console.error('Error fetching word timestamps:', error);
    throw new Error('Failed to fetch word timestamps');
  }
};
