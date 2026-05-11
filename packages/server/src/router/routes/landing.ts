import { getFeaturedCubes } from 'serverutils/featuredQueue';
import { redirect, render } from 'serverutils/render';

import { Request, Response } from '../../types/express';

const landingHandler = async (req: Request, res: Response) => {
  // If user is logged in, redirect to dashboard
  if (req.user) {
    return redirect(req, res, '/dashboard');
  }

  const featured = await getFeaturedCubes(8);

  return render(req, res, 'LandingPage', {
    featured,
  });
};

export const routes = [
  {
    path: '',
    method: 'get',
    handler: [landingHandler],
  },
];
