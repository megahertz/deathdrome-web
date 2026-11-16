import { resolveImage } from './resource-source.ts';
import type { ImageRequest, SavedSource } from './resource-types.ts';
interface SourceOptions {
  version?: number;
  base?: string;
}
export function reusableInstallation(
  profile: unknown,
  request: ImageRequest,
  { version, base }: SourceOptions = {},
): profile is SavedSource {
  if (
    request.noCache ||
    !profile ||
    typeof profile !== 'object' ||
    !('id' in profile) ||
    !profile.id ||
    !('converterVersion' in profile) ||
    profile.converterVersion !== version
  ) {
    return false;
  }
  if (request.defaultImage) {
    return true;
  }
  try {
    return (
      'source' in profile &&
      typeof profile.source === 'string' &&
      resolveImage(profile.source, base) === resolveImage(request.image, base)
    );
  } catch {
    return false;
  }
}
interface StartupOptions<T extends SavedSource> extends SourceOptions {
  readInstalled: () => Promise<T | null>;
  hasResources: (profile: T) => Promise<boolean>;
  launch: (profile: T) => Promise<unknown>;
  loadImage: (url: string) => Promise<unknown>;
  onCacheError?: (error: unknown) => void;
}
// A healthy installation starts before any request for the original image.
export async function startResources<T extends SavedSource>(
  request: ImageRequest,
  {
    version,
    base,
    readInstalled,
    hasResources,
    launch,
    loadImage,
    onCacheError = () => {},
  }: StartupOptions<T>,
) {
  let profile: T | null = null;
  if (!request.noCache) {
    try {
      const saved = await readInstalled();
      if (
        saved &&
        reusableInstallation(saved, request, { version, base }) &&
        (await hasResources(saved))
      ) {
        profile = saved;
      }
    } catch (error) {
      onCacheError(error);
    }
  }
  if (profile) {
    await launch(profile);
    return 'cache';
  }
  await loadImage(request.image);
  return 'image';
}
