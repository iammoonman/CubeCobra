import { packageDao, userDao } from 'dynamo/daos';
import { handleRouteError, redirect, render } from 'serverutils/render';

import { Request, Response } from '../../../types/express';

export const handler = async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;

    if (!userid) {
      req.flash('danger', 'User ID required');
      return redirect(req, res, '/404');
    }

    const user = await userDao.getById(userid);
    if (!user) {
      req.flash('danger', 'User not found');
      return redirect(req, res, '/404');
    }

    const result = await packageDao.queryByOwner(userid, 'date', false, undefined, 36);

    return render(req, res, 'UserPackagesPage', {
      owner: user,
      followersCount: (user.following || []).length,
      following: req.user && (req.user.followedUsers || []).some((id) => id === user.id),
      packages: result.items || [],
      lastKey: result.lastKey,
    });
  } catch (err) {
    return handleRouteError(req, res, err as Error, '/404');
  }
};

export const routes = [
  {
    path: '/:userid',
    method: 'get',
    handler: [handler],
  },
];
