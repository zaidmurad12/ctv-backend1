import { Movie, TVShow } from '../entities/content.js';

export class ContentDomainService {
  publishIfEligible(content: Movie | TVShow): void {
    if (content.status !== 'published') {
      content.publish();
    }
  }

  removeIfEligible(content: Movie | TVShow): void {
    if (content.status !== 'removed') {
      content.remove();
    }
  }
}
