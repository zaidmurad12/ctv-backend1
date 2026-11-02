import { PrismaClient } from '@prisma/client';
import { AdminShowsRepository } from '../apps/backend/dist/admin/infrastructure/adminShowsRepository.js';
const client = new PrismaClient();
const repo = new AdminShowsRepository({ client }, null, null, null, null);
// Throwaway show: 2 seasons (3+2 episodes) -> restructure to [2,2,2] (adds 1 placeholder).
const show = await client.tVShow.create({ data: { title: 'ZZ restructure test', status: 'DRAFT' } });
try {
  for (const [sn, count] of [[1, 3], [2, 2]]) {
    const s = await client.season.create({ data: { showId: show.id, seasonNumber: sn, episodeCount: count } });
    for (let e = 1; e <= count; e++) await client.episode.create({ data: { seasonId: s.id, episodeNumber: e, title: `S${sn}E${e}` } });
  }
  const dump = async () => (await client.season.findMany({ where: { showId: show.id }, orderBy: { seasonNumber: 'asc' }, include: { episodes: { orderBy: { episodeNumber: 'asc' } } } }))
    .map((s) => `S${s.seasonNumber}: ` + s.episodes.map((e) => `${e.episodeNumber}=${e.title}`).join(' '));
  console.log('before', await dump());
  await repo.restructureSeasons(show.id, [2, 2, 2], false);
  console.log('after [2,2,2]', await dump(), JSON.stringify(await client.tVShow.findUnique({ where: { id: show.id }, select: { numberOfSeasons: true, numberOfEpisodes: true, seasonLayoutCustom: true } })));
  try { await repo.restructureSeasons(show.id, [1, 1], false); } catch (e) { console.log('shrink w/o allowDelete ->', e.message.slice(0, 60)); }
  await repo.restructureSeasons(show.id, [1, 1], true);
  console.log('after [1,1] allowDelete', await dump());
} finally {
  await client.tVShow.delete({ where: { id: show.id } });
  console.log('cleaned up');
  await client.$disconnect();
}
