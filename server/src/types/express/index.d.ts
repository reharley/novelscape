import { User } from '../../middleware/auth';
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
