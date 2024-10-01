import { Card } from 'antd';
import React from 'react';
import { Profile } from '../../utils/types';

interface ProfileCardProps {
  profile: Profile;
  onClick: (profile: Profile) => void;
}

const { Meta } = Card;

const ProfileCard: React.FC<ProfileCardProps> = ({ profile, onClick }) => {
  return (
    <Card
      hoverable
      style={{ width: 240 }}
      cover={
        profile.imageUrl && profile.imageUrl !== '' ? (
          <img alt={profile.name} src={profile.imageUrl} />
        ) : undefined
      }
      onClick={() => onClick(profile)}
    >
      <Meta title={profile.name} description={profile.type} />
    </Card>
  );
};

export default ProfileCard;
