import basicAuth from 'basic-auth';
import express, { Request, Response } from 'express';
import prisma from '../config/prisma.js';

const router = express.Router();
const USERNAME = process.env.BASIC_AUTH_USERNAME || 'your-username';
const PASSWORD = process.env.BASIC_AUTH_PASSWORD || 'your-password';

const app = express();
const authenticate = (req: Request, res: Response, next: () => void) => {
  const user = basicAuth(req);

  if (!user || user.name !== USERNAME || user.pass !== PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="example"');
    res.status(401).send('Authentication required');
    return;
  }
  next();
};

// Webhook to handle API connector requests
router.post('/roles', authenticate, async (req: Request, res: Response) => {
  const userId = req.body.objectId; // This is the user ID from Azure AD B2C

  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  const applicationRoles = user?.roles ?? '';

  const response = {
    version: '1.0.0',
    action: 'Continue',
    extension_applicationRoles: applicationRoles,
  };

  res.status(200).json(response);
});

export default router;
