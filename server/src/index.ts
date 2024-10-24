import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';

import './config/dotenv.js';
import prisma from './config/prisma.js';
import { auth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import './utils/appInsights.js';
import corsOptions from './utils/cors.js';

prisma; // Initialize Prisma Client
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// @ts-ignore
app.use(cors(corsOptions));
app.use(express.json());
app.use(auth);
app.use(bodyParser.json({ limit: '100mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(errorHandler);

// Routes
app.use('/api', routes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
