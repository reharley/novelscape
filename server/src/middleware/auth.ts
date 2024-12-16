import { NextFunction } from 'express';

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
const client = jwksClient({
  jwksUri:
    'https://novelscape.b2clogin.com/novelscape.onmicrosoft.com/B2C_1_signin/discovery/v2.0/keys',
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err: any, key: any) {
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}
export type User = {
  aud: string;
  iss: string;
  exp: number;
  nbf: number;
  idp_access_token: string;
  given_name: string;
  family_name: string;
  name: string;
  idp: string;
  oid: string;
  sub: string;
  emails: string[];
  tfp: string;
  nonce: string;
  scp: string;
  azp: string;
  ver: string;
  iat: number;
};
const webhooks = ['/api/ad/roles'];
export function auth(req: any, res: any, next: NextFunction) {
  if (webhooks.includes(req.url)) {
    return next();
  }
  if (req.url.includes('/api/books/')) {
    // Allow access to books for easy sharing
    return next();
  }
  if (!req.headers.authorization) {
    res.status(401).send('Unauthorized');
    return;
  }
  const token = req.headers.authorization.split(' ')[1];

  jwt.verify(token, getKey, {}, (err: any, decoded: any) => {
    if (err) {
      res.status(401).send('Unauthorized');
      return;
    }
    req.user = decoded;
    next();
  });
}
