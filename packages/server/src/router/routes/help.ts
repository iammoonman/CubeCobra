import { render } from 'serverutils/render';

import { Request, Response } from '../../types/express';

const helpHandler = async (req: Request, res: Response) => {
  return render(req, res, 'HelpPage', {}, { title: 'Help' });
};

export const routes = [
  {
    path: '',
    method: 'get',
    handler: [helpHandler],
  },
];
