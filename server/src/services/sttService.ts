import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import leven from 'leven';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import openai from '../config/openai.js';
import prisma from '../config/prisma.js';

export type AudioFile = {
  filename: string;
  buffer: Buffer;
  mimeType: string;
};

export async function processAudiobook(
  bookId: number,
  audioFiles: AudioFile[]
): Promise<void> {
  // Fetch the book and its chapters and passages from the database
  const book = await prisma.book.findUnique({
    where: {
      id: bookId,
    },
    include: {
      chapters: {
        include: {
          passages: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  });

  if (!book) {
    throw new Error(`Book with id ${bookId} not found.`);
  }

  // Initialize ffmpeg
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

  // Step 1: Upload audio files to Azure and store the URLs
  const audioUrls: string[] = [];
  for (const file of audioFiles) {
    // const fileName = uuidv4() + '_' + file.filename;
    // const audioUrl = await uploadAudio(fileName, file.buffer, file.mimeType);
    // audioUrls.push(audioUrl);
  }

  // Step 2: Process each audio file
  let fullTranscriptSegments: any[] = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];

    // Step 2a: Check if the file size exceeds 25MB
    if (file.buffer.length > 25 * 1024 * 1024) {
      // Split the audio file into chunks less than 25MB
      const chunks = await splitAudioFile(file.buffer, file.filename);
      for (const chunk of chunks) {
        // Transcribe each chunk
        const chunkTranscript = await transcribeAudioChunk(chunk.buffer);
        fullTranscriptSegments = fullTranscriptSegments.concat(chunkTranscript);
      }
    } else {
      // Transcribe the audio file directly
      const transcript = await transcribeAudioChunk(file.buffer);
      fullTranscriptSegments = fullTranscriptSegments.concat(transcript);
    }
  }

  // Step 3: Detect chapter starts in the transcription based on the first passage text
  const chapterIndices: { [chapterOrder: number]: number } = {}; // Map of chapter order to segment index

  // Prepare concatenated transcript text and positions
  const transcriptTextArray: string[] = [];
  const transcriptPositions: number[] = []; // Starting positions of each segment
  let cumulativeLength = 0;

  for (const segment of fullTranscriptSegments) {
    transcriptPositions.push(cumulativeLength);
    transcriptTextArray.push(segment.text);
    cumulativeLength += segment.text.length;
  }

  // Concatenate the full transcript text
  const fullTranscriptText = transcriptTextArray.join('');

  let searchStartPosition = 0; // Initialize search start position for optimization

  // For each chapter, find the start index where the first passage text appears in the transcript
  for (const chapter of book.chapters) {
    const chapterOrder = chapter.order;
    if (chapter.passages.length === 0) {
      console.warn(`Chapter ${chapterOrder} has no passages.`);
      continue;
    }
    const firstPassageText = chapter.passages[0].textContent;

    // Slice the transcript text from the last found position
    const transcriptSlice = fullTranscriptText.slice(searchStartPosition);

    // Find the best match position in the sliced transcript
    const matchPositionInSlice = findBestMatchPosition(
      transcriptSlice,
      firstPassageText
    );

    if (matchPositionInSlice !== -1) {
      // Adjust the match position relative to the full transcript
      const matchPosition = searchStartPosition + matchPositionInSlice;

      // Now find the segment index corresponding to this position
      const segmentIndex = getSegmentIndexAtPosition(
        transcriptPositions,
        matchPosition
      );

      chapterIndices[chapterOrder] = segmentIndex;

      // Update the search start position for the next chapter
      searchStartPosition = matchPosition;
    } else {
      console.warn(
        `Could not find a match for chapter ${chapterOrder} in the transcription.`
      );
    }
  }

  // Step 4: Align transcript segments to book's passages based on content
  for (const chapter of book.chapters) {
    const chapterOrder = chapter.order;
    const startIndex = chapterIndices[chapterOrder];
    const endIndex =
      chapterIndices[chapterOrder + 1] || fullTranscriptSegments.length;

    if (startIndex === undefined) {
      console.warn(`Chapter ${chapterOrder} not found in transcription.`);
      continue;
    }

    // Extract the segments corresponding to this chapter
    const chapterSegments = fullTranscriptSegments.slice(startIndex, endIndex);

    // Concatenate the chapter text
    const chapterTranscriptText = chapterSegments.map((s) => s.text).join('');

    let chapterSearchStartPosition = 0; // Position within the chapter transcript text

    // For each passage in the chapter, find its position in the chapter transcript
    for (const passage of chapter.passages) {
      const passageText = passage.textContent;

      // Slice the chapter transcript text from where the last passage was found
      const chapterTranscriptSlice = chapterTranscriptText.slice(
        chapterSearchStartPosition
      );

      // Find the best match position in the sliced chapter transcript
      const matchPositionInChapterSlice = findBestMatchPosition(
        chapterTranscriptSlice,
        passageText
      );

      if (matchPositionInChapterSlice !== -1) {
        // Adjust the match position relative to the chapter transcript
        const matchPosition =
          chapterSearchStartPosition + matchPositionInChapterSlice;

        // Extract the corresponding segments
        const passageSegments = extractSegmentsFromText(
          chapterSegments,
          matchPosition,
          passageText.length
        );

        // Create WordTimestamp entries
        const wordTimestamps = passageSegments.map((segment) => ({
          word: segment.text.trim(),
          startTime: segment.start,
          endTime: segment.end,
        }));

        // Update the passage in the database
        await prisma.passage.update({
          where: { id: passage.id },
          data: {
            audioUrl: audioUrls[0], // Assuming all passages use the same audio file
            wordTimestamps: {
              create: wordTimestamps.map((wt) => ({
                word: wt.word,
                startTime: wt.startTime,
                endTime: wt.endTime,
              })),
            },
          },
        });

        // Update the chapter search start position
        chapterSearchStartPosition = matchPosition;
      } else {
        console.warn(
          `Could not find a match for passage ${passage.id} in chapter ${chapterOrder}.`
        );
      }
    }

    // Update the chapter to indicate it's processed
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        speechProcessed: true,
      },
    });
  }
}

// Helper function to transcribe an audio chunk
async function transcribeAudioChunk(buffer: Buffer) {
  // Since OpenAI's createTranscription might require a file path, we'll write a temporary file here
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  const tempFilePath = path.join(tempDir, `audio_chunk_${uuidv4()}.mp3`);
  fs.writeFileSync(tempFilePath, buffer);

  // Transcribe the audio file
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath) as any,
    model: 'whisper-1',
    response_format: 'verbose_json',
  });

  // Clean up the temporary audio file
  fs.unlinkSync(tempFilePath);

  const transcription = response;
  const segments = transcription.segments;

  // For testing purposes, write the transcription results to a temporary data file
  const transcriptFilePath = path.join(
    tempDir,
    `transcript_chunk_${uuidv4()}.json`
  );
  fs.writeFileSync(
    transcriptFilePath,
    JSON.stringify(segments, null, 2),
    'utf-8'
  );
  console.log(`Transcription chunk results written to ${transcriptFilePath}`);

  return segments;
}

const __dirname = path.resolve();

// Helper function to split audio files larger than 25MB
async function splitAudioFile(
  buffer: Buffer,
  filename: string
): Promise<AudioFile[]> {
  // Since ffmpeg requires file paths, we'll need to use temporary files here
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const inputFilePath = path.join(tempDir, `input_${uuidv4()}_${filename}`);
  fs.writeFileSync(inputFilePath, buffer);

  // Get the duration of the audio file
  const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(inputFilePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const duration = metadata.format.duration; // in seconds
  if (!duration) {
    throw new Error('Failed to get audio duration.');
  }

  // Calculate the number of chunks needed
  const fileSizeMB = buffer.length / (1024 * 1024);
  const numChunks = Math.ceil(fileSizeMB / 24); // Slightly less than 25MB to be safe
  const chunkDuration = duration / numChunks;

  const chunks: AudioFile[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const outputFilePath = path.join(
      tempDir,
      `chunk_${i}_${uuidv4()}_${filename}`
    );

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFilePath)
        .setStartTime(startTime)
        .duration(chunkDuration)
        .output(outputFilePath)
        .on('end', () => {
          const chunkBuffer = fs.readFileSync(outputFilePath);
          chunks.push({
            filename: path.basename(outputFilePath),
            buffer: chunkBuffer,
            mimeType: 'audio/mpeg',
          });
          // Clean up the chunk file
          fs.unlinkSync(outputFilePath);
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .run();
    });
  }

  // Clean up the input file
  fs.unlinkSync(inputFilePath);

  return chunks;
}

// Helper function to find the best match position of passageText in transcriptText
function findBestMatchPosition(
  transcriptText: string,
  passageText: string
): number {
  // Using a sliding window approach with Levenshtein distance for fuzzy matching
  const windowSize = passageText.length;
  let minDistance = Infinity;
  let bestPosition = -1;

  for (let i = 0; i <= transcriptText.length - windowSize; i++) {
    const windowText = transcriptText.substr(i, windowSize);
    const distance = leven(windowText, passageText);

    if (distance < minDistance) {
      minDistance = distance;
      bestPosition = i;
    }

    // Early exit if perfect match
    if (distance === 0) {
      break;
    }
  }

  // You can define a threshold for acceptable distance
  const threshold = Math.floor(passageText.length * 0.3); // Allow up to 30% difference
  if (minDistance <= threshold) {
    return bestPosition;
  } else {
    return -1;
  }
}

// Helper function to extract segments corresponding to a text range
function extractSegmentsFromText(
  segments: any[],
  startPosition: number,
  length: number
): any[] {
  let accumulatedLength = 0;
  const resultSegments = [];

  for (const segment of segments) {
    const segmentText = segment.text;
    const segmentLength = segmentText.length;

    if (
      accumulatedLength + segmentLength >= startPosition &&
      accumulatedLength <= startPosition + length
    ) {
      resultSegments.push(segment);
    }

    accumulatedLength += segmentLength;

    if (accumulatedLength > startPosition + length) {
      break;
    }
  }

  return resultSegments;
}

// Helper function to get segment index at a specific position
function getSegmentIndexAtPosition(
  transcriptPositions: number[],
  position: number
): number {
  // Using binary search
  let left = 0;
  let right = transcriptPositions.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (
      transcriptPositions[mid] <= position &&
      (mid === transcriptPositions.length - 1 ||
        position < transcriptPositions[mid + 1])
    ) {
      return mid;
    } else if (transcriptPositions[mid] > position) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  // If not found, return -1
  return -1;
}
