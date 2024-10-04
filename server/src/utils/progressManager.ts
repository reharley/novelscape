import { Response } from 'express';

interface ProgressClients {
  [bookId: string]: Set<Response>;
}

class ProgressManager {
  private clients: ProgressClients = {};

  addClient(bookId: string, res: Response) {
    if (!this.clients[bookId]) {
      this.clients[bookId] = new Set();
    }
    this.clients[bookId].add(res);
  }

  removeClient(bookId: string, res: Response) {
    if (this.clients[bookId]) {
      this.clients[bookId].delete(res);
      if (this.clients[bookId].size === 0) {
        delete this.clients[bookId];
      }
    }
  }

  sendProgress(bookId: string, data: any) {
    if (this.clients[bookId]) {
      this.clients[bookId].forEach((res) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      });
    }
  }

  closeAllClients(bookId: string) {
    if (this.clients[bookId]) {
      this.clients[bookId].forEach((res) => {
        res.end();
      });
      delete this.clients[bookId];
    }
  }
}

export const progressManager = new ProgressManager();
