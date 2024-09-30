import { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err.stack);
  res.status(500).json({ error: 'An unexpected error occurred.' });
}
