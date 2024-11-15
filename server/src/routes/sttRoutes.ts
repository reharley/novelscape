import { Router } from 'express';
import multer from 'multer';
import { AudioFile, processAudiobook } from '../services/sttService.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
router.post(
  '/upload-audiobook',
  upload.array('audioFiles'),
  async (req, res) => {
    try {
      const bookId = parseInt(req.body.bookId, 10);
      if (isNaN(bookId)) {
        res.status(400).json({ error: 'Invalid bookId provided.' });
        return;
      }

      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No audio files uploaded.' });
        return;
      }

      // Map uploaded files to AudioFile type
      const audioFiles: AudioFile[] = files.map((file) => ({
        filename: file.originalname,
        buffer: file.buffer,
        mimeType: file.mimetype,
      }));

      // Call the processAudiobook function
      await processAudiobook(bookId, audioFiles);

      res.status(200).json({ message: 'Audiobook processing started.' });
    } catch (error) {
      console.error('Error processing audiobook:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
);

export default router;
