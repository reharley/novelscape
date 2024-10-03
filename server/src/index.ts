import cors from 'cors';
import express from 'express';
import './config/dotenv'; // Initialize environment variables
import prisma from './config/prisma';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
prisma; // Initialize Prisma Client
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Error Handling Middleware
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
