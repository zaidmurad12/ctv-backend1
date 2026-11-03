import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, MinLength, ValidateNested } from 'class-validator';

// A manual pin from one of our titles to the entry it plays from on a source (see Movie.sourceLinks).
export interface SourceLink {
  source: 'cee' | 'cinemana';
  nb: string;
  kind: 'movie' | 'series';
}

export class SourceLinkDto implements SourceLink {
  @IsIn(['cee', 'cinemana'])
  source!: 'cee' | 'cinemana';

  @IsString()
  @MinLength(1)
  nb!: string;

  @IsIn(['movie', 'series'])
  kind!: 'movie' | 'series';
}

export class SourceLinksInput {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceLinkDto)
  links!: SourceLinkDto[];
}

// The column is untyped JSON - anything that isn't a well-formed entry is dropped rather than trusted.
export function parseSourceLinks(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = entry as Partial<SourceLink> | null;
    if (!e || (e.source !== 'cee' && e.source !== 'cinemana') || typeof e.nb !== 'string' || !e.nb)
      return [];
    return [
      {
        source: e.source,
        nb: e.nb,
        kind: e.kind === 'series' ? ('series' as const) : ('movie' as const),
      },
    ];
  });
}
