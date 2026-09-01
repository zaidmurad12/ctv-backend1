import { isOk } from '@ctv-platform/domain';
import type { ProviderInterface, ProviderMovieDto, ProviderShowDto } from '@ctv-platform/sdk';
import { extractExternalIdentifiers } from '../matching/index.js';
import type { ContentMatcher, MatchCandidate } from '../matching/contentMatcher.js';

/**
 * Implements the "Integration Flow" from
 * specification/07-TMDB-Integration.md.txt: search each metadata-enrichment
 * provider (capability `METADATA_ENRICHMENT`) for the content's title,
 * apply the same matching chain used for duplicate detection to find the
 * right entry, then download its full details. A miss is not an error —
 * "Missing Metadata: Movie remains valid. Metadata may remain incomplete."
 */
export class MetadataEnricher {
  constructor(private readonly matcher: ContentMatcher) {}

  async enrichMovie(
    source: ProviderMovieDto,
    metadataProviders: readonly ProviderInterface[],
  ): Promise<ProviderMovieDto | null> {
    for (const provider of metadataProviders) {
      const candidate = await this.findCandidate(provider, source.title, source);
      if (!candidate) {
        continue;
      }
      const detail = await provider.movie(candidate.id);
      if (isOk(detail)) {
        return detail.value;
      }
    }
    return null;
  }

  async enrichShow(
    source: ProviderShowDto,
    metadataProviders: readonly ProviderInterface[],
  ): Promise<ProviderShowDto | null> {
    for (const provider of metadataProviders) {
      const candidate = await this.findCandidate(provider, source.title, source);
      if (!candidate) {
        continue;
      }
      const detail = await provider.show(candidate.id);
      if (isOk(detail)) {
        return detail.value;
      }
    }
    return null;
  }

  private async findCandidate(
    provider: ProviderInterface,
    title: string,
    source: ProviderMovieDto | ProviderShowDto,
  ): Promise<MatchCandidate | null> {
    const searchResult = await provider.search({ term: title });
    if (!isOk(searchResult)) {
      return null;
    }

    const candidates: MatchCandidate[] = searchResult.value.items.map((item) => ({
      id: item.providerContentId,
      title: item.title,
    }));
    const outcome = this.matcher.match(
      { title, identifiers: extractExternalIdentifiers(source) },
      candidates,
    );
    return outcome.matched ? outcome.candidate : null;
  }
}
