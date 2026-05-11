import { redirect } from 'serverutils/render';

import { Request, Response } from '../../../types/express';

export const getTopCardsHandler = async (req: Request, res: Response) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  params.set('v', 'rows');
  return redirect(req, res, `/tool/searchcards?${params.toString()}`);
};

export const routes = [
  {
    method: 'get',
    path: '/',
    handler: [getTopCardsHandler],
  },
];
