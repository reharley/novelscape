import { Prisma } from '@prisma/client';

export type ProfileWithRelations = Prisma.ProfileGetPayload<{
  include: {
    descriptions: true;
    image: {
      include: {
        generationData: {
          include: {
            civitaiResources: {
              include: {
                model: true;
              };
            };
          };
        };
      };
    };
  };
}>;
