import React, { useContext } from 'react';

import { UploadIcon } from '@primer/octicons-react';
import { UserRoles } from '@utils/datatypes/User';

import { Flexbox } from 'components/base/Layout';
import ResponsiveDiv from 'components/base/ResponsiveDiv';
import UploadDecklistModal from 'components/modals/UploadDecklistModal';
import withModal from 'components/WithModal';
import CubeContext from 'contexts/CubeContext';
import UserContext from 'contexts/UserContext';

const UploadDecklistModalButton = withModal('a', UploadDecklistModal);

const PlaytestNavbar: React.FC = () => {
  const user = useContext(UserContext);
  const { cube } = useContext(CubeContext);

  const isAdmin = !!user && Array.isArray(user.roles) && user.roles.includes(UserRoles.ADMIN);
  const canManage = (user && cube && user.id === cube.owner.id) || isAdmin;

  if (!canManage) {
    return null;
  }

  return (
    <Flexbox direction="row" gap="2" alignItems="center" justify="start" className="px-2" wrap="wrap">
      <UploadDecklistModalButton className="flex items-center gap-2 !text-link hover:!text-link-active transition-colors font-medium cursor-pointer px-2">
        <UploadIcon size={16} />
        <ResponsiveDiv baseVisible md>
          Upload
        </ResponsiveDiv>
        <ResponsiveDiv md>Upload Decklist</ResponsiveDiv>
      </UploadDecklistModalButton>
    </Flexbox>
  );
};

export default PlaytestNavbar;
