export enum NsfwLevelEnum {
  None = 1,
  Soft = 2,
  Mature = 3,
  NSFW = 4,
}

export const getNsfwLabel = (level: number): string | null => {
  if (level >= NsfwLevelEnum.NSFW) {
    return 'NSFW';
  }
  switch (level) {
    case NsfwLevelEnum.None:
      return null;
    case NsfwLevelEnum.Soft:
      return 'Soft NSFW';
    case NsfwLevelEnum.Mature:
      return 'Mature NSFW';
    default:
      return null;
  }
};
